import { describe, expect, it } from "vitest";

import {
  buildKillTreePlan,
  buildOrphanKillPlan,
  buildPreviousRunOrphanScanPlan,
  buildSessionOrphanScanPlan,
  classifyOrphanScanOutcome,
  DEFAULT_TASKKILL,
  hasTrackedProcessExited,
  type KillTreePlan,
  MCP_SERVER_SCRIPT_NAME,
  MCP_TEMP_DIR_PREFIX,
  parseOrphanScanPids,
  shouldDetachProviderSpawn,
  shouldReapSessionOrphans,
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
        systemRootFallback: "",
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
        systemRootFallback: "",
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
        systemRootFallback: "",
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
        systemRootFallback: "",
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
        systemRootFallback: "",
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
        systemRootFallback: "",
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
        systemRootFallback: "",
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
        systemRootFallback: "",
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
      systemRootFallback: "",
    });
    const kill = buildKillTreePlan({
      pid: PID,
      platform: "win32",
      env: { SystemRoot: SYSTEM_ROOT },
      rung: "kill",
      systemRootFallback: "",
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
        buildKillTreePlan({ pid: PID, platform, env: {}, rung: "term", systemRootFallback: "" }),
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
        buildKillTreePlan({ pid: PID, platform, env: {}, rung: "kill", systemRootFallback: "" }),
      );

      expect(plan.file).toBe("kill");
      expect(plan.args).toEqual(["-KILL", "--", "-4321"]);
    }
  });

  it("renders the group reference as a negative decimal STRING inside args", () => {
    // The POSIX half of Pitfall 3's positive assertion. The minus sign belongs
    // to the RENDERING, in here, and not to a template literal at a call site.
    const plan = expectSpawn(
      buildKillTreePlan({ pid: PID, platform: "darwin", env: {}, rung: "term", systemRootFallback: "" }),
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
      systemRootFallback: "",
    });
    const withoutRoot = buildKillTreePlan({
      pid: PID,
      platform: "linux",
      env: {},
      rung: "term",
      systemRootFallback: "",
    });

    expect(withRoot).toEqual(withoutRoot);
  });
});

// G-01 / T-08-03 — the rung between the environment read and the bare name.
//
// WHY THIS BLOCK EXISTS AT ALL, and it is a measurement rather than a worry: the
// environment the win32 arm above reads is EMPTY on a real Caido install
// (2026-08-27 diagnostics, `parentEnvKeyCount: 0`). Every case in the block
// above passes a POPULATED env, which is the CI condition and not the shipping
// one — so the bare-name arm those cases treat as an edge was in fact the
// expected Windows answer on every real machine. These three cases assert the
// ladder that fixes that, rung by rung.
//
// RED INPUT for the whole block: remove the `systemRootFallback` argument at any
// PRODUCTION call site and the compiler rejects it, because the member is
// required rather than optional. That is the point of making it required — the
// CR-01 failure shape was a security-relevant parameter that worked perfectly in
// its own unit test and that no production call site ever passed.
describe("buildKillTreePlan — the derived-root rung beneath the environment (G-01)", () => {
  it("uses the DERIVED fallback when the environment carries no root", () => {
    // The arm a real Windows install actually takes.
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: {},
        rung: "term",
        systemRootFallback: "D:\\Windows",
      }),
    );

    expect(plan.file).toBe("D:\\Windows\\System32\\taskkill.exe");
    expect(plan.args).toEqual(["/pid", "4321", "/t", "/f"]);
  });

  it("prefers a populated environment over the derived fallback", () => {
    // The environment is the MEASURED root; the fallback is a DERIVATION that
    // `TEMP` redirected across drives can get wrong. The measurement wins
    // wherever it exists.
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: { SystemRoot: SYSTEM_ROOT },
        rung: "term",
        systemRootFallback: "D:\\Windows",
      }),
    );

    expect(plan.file).toBe(`${SYSTEM_ROOT}\\System32\\taskkill.exe`);
  });

  it("keeps the BARE name as the genuine last resort, reachable and tested", () => {
    // SC-1 (amended by WR-04) permits this form only when no root can be read
    // AND none can be derived. Deleting the arm would be the wrong fix: a host
    // in that state still has to be handed something, and a bare name that
    // fails loudly is what it gets.
    const plan = expectSpawn(
      buildKillTreePlan({
        pid: PID,
        platform: "win32",
        env: {},
        rung: "term",
        systemRootFallback: "",
      }),
    );

    expect(plan.file).toBe("taskkill.exe");
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

// THE T-08-04 IDENTITY DECISION, and the one arm that matters most is the LLRT
// one. `isPidAlive` proves liveness, and a reassigned pid is alive — so the
// deferred forceful rung needs an answer about the HANDLE, not about the number.
// This is that answer, reachable from literals because the handle's two scalars
// are injected rather than read (review CR-02).
describe("hasTrackedProcessExited — handle identity, on both runtimes (T-08-04)", () => {
  it("reports NOT exited for a running Node handle", () => {
    // Node while the child runs: both properties are null, no event yet.
    expect(
      hasTrackedProcessExited({
        observedExitEvent: false,
        exitCode: null,
        signalCode: null,
      }),
    ).toBe(false);
  });

  it("reports exited on a Node exit code, including the falsy zero", () => {
    // `0` is the ordinary success exit and is FALSY. A truthiness test here
    // would report the commonest exit of all as "still running".
    expect(
      hasTrackedProcessExited({
        observedExitEvent: false,
        exitCode: 0,
        signalCode: null,
      }),
    ).toBe(true);
    expect(
      hasTrackedProcessExited({
        observedExitEvent: false,
        exitCode: 1,
        signalCode: null,
      }),
    ).toBe(true);
  });

  it("reports exited on a Node signal code", () => {
    // A SIGKILLed child leaves `exitCode` null and `signalCode` set. Reading
    // only `exitCode` would miss every process this phase's own rungs kill.
    expect(
      hasTrackedProcessExited({
        observedExitEvent: false,
        exitCode: null,
        signalCode: "SIGKILL",
      }),
    ).toBe(true);
  });

  it("reports NOT exited when the runtime carries no exit state at all", () => {
    // THE LLRT ARM, AND THE REASON THIS FUNCTION EXISTS AS A FUNCTION. Caido's
    // `ChildProcess` defines `pid` and `kill` and nothing else, so both reads
    // are `undefined` on every real install. `undefined !== null` is TRUE, so
    // the obvious `exitCode !== null` spelling would return "exited" for EVERY
    // pid there and silently disable the deferred forceful rung — green on all
    // five CI legs, broken on every machine a user runs. Delete this case and
    // that regression can walk back in unobserved.
    expect(
      hasTrackedProcessExited({
        observedExitEvent: false,
        exitCode: undefined,
        signalCode: undefined,
      }),
    ).toBe(false);
  });

  it("reports exited on the handle's own exit event, whatever the runtime", () => {
    // The LLRT-side identity source: it emits `exit` on the handle even though
    // it exposes no exit state. Only the process we spawned can fire it.
    expect(
      hasTrackedProcessExited({
        observedExitEvent: true,
        exitCode: undefined,
        signalCode: undefined,
      }),
    ).toBe(true);
  });

  it("never reports exited on ignorance, only on evidence (CMP-01)", () => {
    // The direction is the safety property: this guard may only ever SKIP a
    // kill, never add one. Every combination that carries no positive evidence
    // of exit must answer false, so an unanswerable runtime keeps the rung that
    // ships today rather than losing it.
    for (const exitCode of [null, undefined] as const) {
      for (const signalCode of [null, undefined] as const) {
        expect(
          hasTrackedProcessExited({ observedExitEvent: false, exitCode, signalCode }),
        ).toBe(false);
      }
    }
  });
});

// ── The orphan reap contract (plan 08-06) ───────────────────────────
//
// Everything below is the same literal-input discipline as everything above,
// applied to the four builders and the one classifier that make up the path
// which does NOT depend on process groups. A6 was measured FALSE on 2026-08-27,
// so "this operand is a single positive pid" is not a style preference — it is
// the whole reason the path exists, and there is a case below that goes red the
// moment someone renders it negative again.

// A token of exactly the shape `genShortToken` (`index.ts`) emits: 20 lowercase
// hex characters.
const SESSION_TOKEN = "9b48c5c2275914bc4fd0";
const SESSION_DIR = `${MCP_TEMP_DIR_PREFIX}${SESSION_TOKEN}`;

// The token body the class-wide (previous-run) pattern must carry INSTEAD of a
// literal token. Pinned as data: a pattern that carried one session's token
// would silently scan for one session rather than for the class.
const TOKEN_CLASS = "[0-9a-f]{8,64}";

// The script name with its dot escaped, which is what a pattern must contain.
// An UNESCAPED dot matches any character, so `mcp-serverXmjs` would match too.
const ESCAPED_SCRIPT = "mcp-server\\.mjs";

const POSIX_PLATFORMS = ["darwin", "linux", undefined] as const;

describe("buildSessionOrphanScanPlan — the accepted scan carries both anchors and their adjacency (LIF-02)", () => {
  it("emits pgrep with the full-command-line flag, the end-of-options separator and one pattern operand", () => {
    for (const platform of POSIX_PLATFORMS) {
      const plan = expectSpawn(
        buildSessionOrphanScanPlan({ platform, sessionDirName: SESSION_DIR }),
      );

      expect(plan.file).toBe("pgrep");
      // `-f` matches the FULL COMMAND LINE. Without it pgrep matches the process
      // NAME, which for `node <dir>/mcp-server.mjs` is `node` — the exact
      // mistake 08-SPIKE.md § Step 3 corrects for `ps -eo comm`, and it would
      // turn this scan into the image-name matching T-08-21 forbids.
      expect(plan.args).toContain("-f");
      expect(plan.args).toContain("--");
      // EXACTLY ONE pattern operand. A second one would be an implicit OR at
      // some pgrep implementations and an error at others.
      expect(plan.args).toHaveLength(3);
      expect(plan.windowsVerbatimArguments).toBe(false);
    }
  });

  it("composes the pattern from the marker, a separator and the ESCAPED script name", () => {
    const plan = expectSpawn(
      buildSessionOrphanScanPlan({
        platform: "darwin",
        sessionDirName: SESSION_DIR,
      }),
    );

    const pattern = plan.args[2];
    expect(pattern).toBe(`${SESSION_DIR}/${ESCAPED_SCRIPT}`);
    // The three components, asserted individually so a failure names which one
    // was lost: without the marker the scan is machine-wide, without the script
    // name it is not anchored on an MCP server, and without the adjacency it
    // would match a directory that merely mentions the token.
    expect(pattern).toContain(SESSION_DIR);
    expect(pattern).toContain(`/${ESCAPED_SCRIPT}`);
    expect(pattern).toContain(MCP_SERVER_SCRIPT_NAME.split(".")[0]);
  });

  it("refuses win32 with unsupported-platform and no argv at all", () => {
    // No enumerator exists there: tasklist does not print command lines, wmic is
    // removed from current Windows, and spawning PowerShell from the plugin is a
    // surface this phase will not open. Recorded as AR-04 rather than hidden.
    const plan = buildSessionOrphanScanPlan({
      platform: "win32",
      sessionDirName: SESSION_DIR,
    });

    expect(plan).toEqual({ kind: "none", reason: "unsupported-platform" });
    expect(plan).not.toHaveProperty("file");
    expect(plan).not.toHaveProperty("args");
  });
});

describe("buildSessionOrphanScanPlan — every unusable marker refuses before a pattern is composed (T-08-21 / T-08-22)", () => {
  // THE BLAST-RADIUS GUARD, arm by arm. Each of these, if accepted, would
  // compose a pattern looser than the one anchor set the threat model permits.
  const REFUSED_MARKERS = [
    { label: "an undefined marker — no MCP runtime is staged", value: undefined },
    { label: "an empty string", value: "" },
    { label: "the prefix alone, with no token body", value: MCP_TEMP_DIR_PREFIX },
    {
      label: "a token below the minimum length",
      value: `${MCP_TEMP_DIR_PREFIX}a1b2c3`,
    },
    {
      label: "a token above the maximum length",
      value: `${MCP_TEMP_DIR_PREFIX}${"a".repeat(65)}`,
    },
    {
      label: "a token carrying an upper-case letter",
      value: `${MCP_TEMP_DIR_PREFIX}A1b2c3d4e5f6`,
    },
    {
      label: "a token carrying a path separator",
      value: `${MCP_TEMP_DIR_PREFIX}a1b2c3d4/e5f6`,
    },
    {
      label: "a token carrying a regular-expression metacharacter",
      value: `${MCP_TEMP_DIR_PREFIX}a1b2.*c3d4`,
    },
    {
      label: "a marker with the right shape but the wrong prefix",
      value: `drift-not-mcp-${SESSION_TOKEN}`,
    },
  ];

  // RED INPUT: delete the marker shape validation from
  // `buildSessionOrphanScanPlan` and the metacharacter, separator and
  // upper-case rows all fail — which is the point, because a metacharacter
  // reaching the enumerator is regular-expression injection into a machine-wide
  // process scan (T-08-22).
  it.each(REFUSED_MARKERS)("refuses $label", ({ value }) => {
    for (const platform of POSIX_PLATFORMS) {
      const plan = buildSessionOrphanScanPlan({
        platform,
        sessionDirName: value,
      });
      expect(plan).toEqual({ kind: "none", reason: "bad-marker" });
      expect(plan).not.toHaveProperty("file");
      expect(plan).not.toHaveProperty("args");
    }
  });
});

describe("buildPreviousRunOrphanScanPlan — the class-wide scan, and the one condition it may run under", () => {
  it("emits the token CLASS rather than a literal token when no session is staged", () => {
    for (const platform of POSIX_PLATFORMS) {
      const plan = expectSpawn(
        buildPreviousRunOrphanScanPlan({
          platform,
          currentSessionDirName: undefined,
        }),
      );

      expect(plan.file).toBe("pgrep");
      expect(plan.args).toEqual([
        "-f",
        "--",
        `${MCP_TEMP_DIR_PREFIX}${TOKEN_CLASS}/${ESCAPED_SCRIPT}`,
      ]);
      // A literal token here would mean the class-wide scan had quietly become
      // a session scan for whichever token was pasted in.
      expect(plan.args[2]).not.toContain(SESSION_TOKEN);
    }
  });

  it("refuses with session-active while a runtime IS staged, and returns no argv", () => {
    // The arm that keeps this safe: a class-wide pattern matches the LIVE
    // session's own MCP child as readily as a dead run's, so it may only ever
    // run when nothing is staged. Refusing beats filtering pids afterwards —
    // a filter is a second thing that can be got wrong, and the cost of getting
    // it wrong is killing the MCP server of the turn the user is watching.
    const plan = buildPreviousRunOrphanScanPlan({
      platform: "darwin",
      currentSessionDirName: SESSION_DIR,
    });

    expect(plan).toEqual({ kind: "none", reason: "session-active" });
    expect(plan).not.toHaveProperty("file");
    expect(plan).not.toHaveProperty("args");
  });

  it("refuses win32 with unsupported-platform and no argv at all", () => {
    const plan = buildPreviousRunOrphanScanPlan({
      platform: "win32",
      currentSessionDirName: undefined,
    });

    expect(plan).toEqual({ kind: "none", reason: "unsupported-platform" });
    expect(plan).not.toHaveProperty("file");
    expect(plan).not.toHaveProperty("args");
  });
});

describe("parseOrphanScanPids — text from another process becomes numbers exactly once (T-08-23)", () => {
  it("returns an ordinary multi-line list in first-seen order", () => {
    expect(
      parseOrphanScanPids({ stdout: "123\n124\n125\n", excludePids: [] }),
    ).toEqual([123, 124, 125]);
  });

  it("tolerates carriage-return-terminated lines", () => {
    // A "123\r\n" line parsed without the trim would be a parse of "123\r".
    expect(
      parseOrphanScanPids({ stdout: "123\r\n124\r\n", excludePids: [] }),
    ).toEqual([123, 124]);
  });

  it("drops blank and whitespace-only lines", () => {
    expect(
      parseOrphanScanPids({ stdout: "\n123\n   \n\n124\n", excludePids: [] }),
    ).toEqual([123, 124]);
  });

  it("drops a non-numeric line rather than letting NaN through", () => {
    expect(
      parseOrphanScanPids({
        stdout: "123\npgrep: illegal option\n124\n",
        excludePids: [],
      }),
    ).toEqual([123, 124]);
  });

  it("drops 0, 1 and any negative — the floor is 1, not 0", () => {
    // `0` is a process-GROUP reference on POSIX (signalling it would signal
    // Drift's own group) and `1` is init. Neither can ever be a Drift MCP child,
    // so a floor of 0 would let the group reference back in through the parser
    // after the builders spent the whole module refusing it.
    expect(
      parseOrphanScanPids({
        stdout: "0\n1\n-1\n-4321\n2\n",
        excludePids: [],
      }),
    ).toEqual([2]);
  });

  it("collapses duplicates", () => {
    expect(
      parseOrphanScanPids({ stdout: "123\n123\n124\n123\n", excludePids: [] }),
    ).toEqual([123, 124]);
  });

  it("drops an excluded pid", () => {
    expect(
      parseOrphanScanPids({ stdout: "123\n124\n", excludePids: [124] }),
    ).toEqual([123]);
  });

  it("returns an empty array for empty output", () => {
    expect(parseOrphanScanPids({ stdout: "", excludePids: [] })).toEqual([]);
  });

  it("preserves FIRST-SEEN order rather than sorting", () => {
    // A sort would be a silent reordering of which orphan is signalled first.
    // Nothing depends on that order today, which is exactly why an accidental
    // sort would go unnoticed — so it is pinned here.
    expect(
      parseOrphanScanPids({
        stdout: "900\n\n12\nnope\n900\n0\n77\r\n1\n",
        excludePids: [12],
      }),
    ).toEqual([900, 77]);
  });
});

describe("buildOrphanKillPlan — one orphan, one POSITIVE pid, never a group (GD-01)", () => {
  // The SAME five shapes `buildKillTreePlan` rejects, asserted from THIS caller
  // too, so the shared `isUnusablePid` predicate is proven from both — a guard
  // that only holds at the call site someone remembered to test is not a guard.
  const REFUSED_PIDS = [
    { label: "an undefined pid", pid: undefined },
    { label: "NaN", pid: Number.NaN },
    { label: "0 — every process in Drift's own group", pid: 0 },
    { label: "-1 — already a group reference", pid: -1 },
    { label: "1.5 — a non-integer cannot be a pid", pid: 1.5 },
  ];

  it.each(REFUSED_PIDS)("refuses $label from the orphan caller too", ({ pid }) => {
    for (const platform of POSIX_PLATFORMS) {
      const plan = buildOrphanKillPlan({ pid, platform });
      expect(plan).toEqual({ kind: "none", reason: "no-pid" });
      expect(plan).not.toHaveProperty("file");
      expect(plan).not.toHaveProperty("args");
    }
  });

  it("renders the pid operand POSITIVE on darwin, linux and an undefined platform", () => {
    // RED INPUT: change the rendering in `buildOrphanKillPlan` to `-${pid}` and
    // this case goes red. That is the machine form of GD-01 — a negative operand
    // is a PROCESS GROUP reference, and A6 was measured FALSE on 2026-08-27
    // (codex pid 43921 in pgid 43752, its mcp-server child pid 44284 in pgid
    // 44284), so a group reference cannot reach the child this path exists for.
    for (const platform of POSIX_PLATFORMS) {
      const plan = expectSpawn(buildOrphanKillPlan({ pid: PID, platform }));

      expect(plan.file).toBe("kill");
      expect(plan.args).toEqual(["-KILL", "--", "4321"]);
      expect(plan.args).toContain("4321");
      expect(plan.args).not.toContain("-4321");
      expect(plan.windowsVerbatimArguments).toBe(false);
    }
  });

  it("refuses win32 with unsupported-platform and no argv at all", () => {
    const plan = buildOrphanKillPlan({ pid: PID, platform: "win32" });

    expect(plan).toEqual({ kind: "none", reason: "unsupported-platform" });
    expect(plan).not.toHaveProperty("file");
    expect(plan).not.toHaveProperty("args");
  });
});

describe("the orphan path never renders a pid as a leading-minus operand (GD-01)", () => {
  it("produces no argument derived from a pid that begins with a minus", () => {
    // Scoped to the ORPHAN builders on purpose. `buildKillTreePlan`'s POSIX arm
    // renders `-4321` deliberately — that is the shipped group kill, asserted
    // above — and this claim is about the path that must NOT depend on groups.
    // RED INPUT: render the `buildOrphanKillPlan` operand negative and this goes
    // red alongside the case above.
    const plans = [
      buildOrphanKillPlan({ pid: PID, platform: "darwin" }),
      buildSessionOrphanScanPlan({
        platform: "darwin",
        sessionDirName: SESSION_DIR,
      }),
      buildPreviousRunOrphanScanPlan({
        platform: "darwin",
        currentSessionDirName: undefined,
      }),
    ];

    for (const plan of plans) {
      if (plan.kind !== "spawn") throw new Error("expected a spawn plan");
      for (const argument of plan.args) {
        // A leading minus followed by digits is the group-reference spelling.
        // `-KILL`, `-f` and `--` are switches and are unaffected.
        expect(/^-\d/.test(argument)).toBe(false);
      }
    }
  });
});

// THE FOUR-ARM DECISION, and the ONLY place must_haves truth 4 is reachable by
// an executed assertion. `reapMcpOrphans` lives in `index.ts`, which no test in
// this project can import, so the ladder was lifted out here on purpose: a
// four-arm decision written inline there is a decision no assertion can reach.
// A scan whose pids are FRESH — the two members review WR-03 added, spelled ONCE
// and spread into every case below so no case can accidentally assert the
// stale-arm behaviour while claiming to assert something else. `scanAgeMs` well
// inside `scanFreshnessBudgetMs` is the ordinary reading: the enumerator answers
// in single-digit milliseconds and the budget is the caller's scan timeout.
const FRESH = { scanAgeMs: 5, scanFreshnessBudgetMs: 1000 } as const;

describe("classifyOrphanScanOutcome — every unavailable-enumeration outcome is a no-op", () => {
  // RED INPUT for the whole block: make any single arm return `kill: true` and
  // that arm's case goes red; hardwire the classifier to refuse and the positive
  // case at the end goes red. The two directions are what make this block a
  // proof rather than a restatement.
  it("treats an enumerator that could not be spawned as a no-op", () => {
    // `spawn` throws SYNCHRONOUSLY for an unspawnable file, which is what a host
    // with no `pgrep` produces. Such a host is left exactly as well served as it
    // is at HEAD: this reaper removes no pre-existing termination path.
    expect(
      classifyOrphanScanOutcome({
        spawnThrew: true,
        exitCode: undefined,
        timedOut: false,
        pids: [123],
        ...FRESH,
      }),
    ).toEqual({
      kind: "noop",
      kill: false,
      reason: "enumerator-unavailable",
    });
  });

  it("treats a timed-out scan as a no-op rather than retrying it", () => {
    expect(
      classifyOrphanScanOutcome({
        spawnThrew: false,
        exitCode: undefined,
        timedOut: true,
        pids: [123],
        ...FRESH,
      }),
    ).toEqual({ kind: "noop", kill: false, reason: "scan-timeout" });
  });

  it("treats a non-zero exit as a no-op, exit 1 and any other alike", () => {
    // Exit 1 is pgrep's DOCUMENTED "no process matched" and is deliberately NOT
    // distinguished: both outcomes reap nothing, so a separate reason would be a
    // distinction with no consequence and one more arm to get wrong.
    for (const exitCode of [1, 2, 127, -1]) {
      expect(
        classifyOrphanScanOutcome({
          spawnThrew: false,
          exitCode,
          timedOut: false,
          pids: [123],
          ...FRESH,
        }),
      ).toEqual({ kind: "noop", kill: false, reason: "scan-failed" });
    }
    // `null` is the code a child killed by a signal leaves behind. Fail-closed.
    expect(
      classifyOrphanScanOutcome({
        spawnThrew: false,
        exitCode: null,
        timedOut: false,
        pids: [123],
        ...FRESH,
      }),
    ).toEqual({ kind: "noop", kill: false, reason: "scan-failed" });
  });

  it("treats a clean scan that matched nothing as a no-op", () => {
    expect(
      classifyOrphanScanOutcome({
        spawnThrew: false,
        exitCode: 0,
        timedOut: false,
        pids: [],
        ...FRESH,
      }),
    ).toEqual({ kind: "noop", kill: false, reason: "no-match" });
  });

  it("reaps ONLY on exit 0 carrying at least one parsed pid", () => {
    // The positive case, and it is not optional: without it the four no-op arms
    // above would all pass against a classifier hardwired to refuse everything,
    // which would be four green assertions over a mechanism that never runs.
    expect(
      classifyOrphanScanOutcome({
        spawnThrew: false,
        exitCode: 0,
        timedOut: false,
        pids: [44284, 123],
        ...FRESH,
      }),
    ).toEqual({ kind: "reap", kill: true, pids: [44284, 123] });
  });

  // ── THE FRESHNESS ARM (review WR-03) ────────────────────────────────────
  //
  // WHY IT IS NOT REDUNDANT WITH `scan-timeout`. The caller arms a `setTimeout`
  // for the same duration, so when the timer runs the window is already bounded.
  // The case this arm is for is the one where it does NOT run: on a starved
  // Caido event loop neither the timer nor the enumerator's `close` callback
  // fires, and whichever becomes runnable first when the loop drains decides the
  // outcome. If `close` wins, the pids handed here were sampled arbitrarily long
  // ago, and `kill -KILL` on a number the OS has since reassigned takes a
  // stranger's process with no recourse (T-08-04's shape, on the one path that
  // holds no handle).
  //
  // RED INPUT for every case below: delete the freshness arm and each returns
  // `{ kind: "reap" }` instead. Verified by running exactly that deletion.
  it("refuses to kill on a scan older than the freshness budget", () => {
    expect(
      classifyOrphanScanOutcome({
        spawnThrew: false,
        exitCode: 0,
        timedOut: false,
        pids: [44284],
        scanAgeMs: 1001,
        scanFreshnessBudgetMs: 1000,
      }),
    ).toEqual({ kind: "noop", kill: false, reason: "scan-stale" });
  });

  it("accepts a scan exactly AT the budget, so the bound is not off by one", () => {
    // The boundary is asserted in BOTH directions on purpose. A `>=` here would
    // refuse a scan the timer would have allowed, which is the reaper failing to
    // fire when it should — the failure direction this phase cares most about.
    expect(
      classifyOrphanScanOutcome({
        spawnThrew: false,
        exitCode: 0,
        timedOut: false,
        pids: [44284],
        scanAgeMs: 1000,
        scanFreshnessBudgetMs: 1000,
      }),
    ).toEqual({ kind: "reap", kill: true, pids: [44284] });
  });

  it("treats an unusable age or budget as stale rather than as fresh", () => {
    // NaN is what a caller subtracting from an unset timestamp produces, and a
    // wrong number is not evidence that these pids are fresh. Same subtractive
    // rule `shouldReapSessionOrphans` states: an unknown resolves toward NOT
    // killing.
    for (const scanAgeMs of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        classifyOrphanScanOutcome({
          spawnThrew: false,
          exitCode: 0,
          timedOut: false,
          pids: [44284],
          scanAgeMs,
          scanFreshnessBudgetMs: 1000,
        }),
      ).toEqual({ kind: "noop", kill: false, reason: "scan-stale" });
    }
    for (const scanFreshnessBudgetMs of [0, -1, 1.5, Number.NaN]) {
      expect(
        classifyOrphanScanOutcome({
          spawnThrew: false,
          exitCode: 0,
          timedOut: false,
          pids: [44284],
          scanAgeMs: 5,
          scanFreshnessBudgetMs,
        }),
      ).toEqual({ kind: "noop", kill: false, reason: "scan-stale" });
    }
  });

  it("keeps a NEGATIVE age reapable, because a clock that went backwards is not a stale scan", () => {
    // `Date.now()` is not monotonic. A system clock stepped backwards between
    // the spawn and the settle yields a negative age, and refusing on it would
    // disable the reaper for the length of the step — the reaper erring toward
    // never firing, which recreates the defect it exists to fix.
    expect(
      classifyOrphanScanOutcome({
        spawnThrew: false,
        exitCode: 0,
        timedOut: false,
        pids: [44284],
        scanAgeMs: -5000,
        scanFreshnessBudgetMs: 1000,
      }),
    ).toEqual({ kind: "reap", kill: true, pids: [44284] });
  });
});

// ── shouldReapSessionOrphans — the idle gate, from literal scalars ──
//
// THE RED INPUT, STATED SO IT DOES NOT HAVE TO BE RE-DERIVED: relax EITHER
// condition from an exact-zero comparison to a truthiness check — write
// `if (input.activeSessionCount) return false` in place of
// `if (input.activeSessionCount !== 0) return false` — and the negative and
// non-integer cases below go red, because `-1` and `NaN` are the values a
// truthiness check reads differently from an exact-zero one (`-1` is truthy and
// would still refuse, but `NaN` is FALSY and a truthiness check would REAP on
// it). Verified by running exactly that mutation; both mutations were confirmed
// red before this suite was kept.
//
// WHY NON-INTEGERS ARE ASSERTED AT ALL. `activeProcesses.size` cannot be `NaN`
// and `mcpDirectCallDepth` should not be, but "should not be" is the assumption
// this whole phase exists to stop trusting: an increment that ran against an
// undefined counter yields `NaN`, and a gate that reaps on `NaN` would fire
// while a self-test was live. Both scalars therefore have to EARN the reap
// rather than merely fail to forbid it.
describe("shouldReapSessionOrphans — only a pair of exact zeros opens the idle gate (T-08-27 / T-08-28)", () => {
  it("reaps when Drift holds no session and has no direct MCP call in flight", () => {
    // The ONE positive case, and it is not optional: without it every refusal
    // below would pass against a predicate hardwired to `return false`, which is
    // a gate over a mechanism that never runs.
    expect(
      shouldReapSessionOrphans({ activeSessionCount: 0, directMcpCallDepth: 0 }),
    ).toBe(true);
  });

  it("refuses while a session is live, whatever the call depth", () => {
    // T-08-27: the marker is the shared temp-dir name, so a reap here would kill
    // the MCP child of a turn the user is watching.
    expect(
      shouldReapSessionOrphans({ activeSessionCount: 1, directMcpCallDepth: 0 }),
    ).toBe(false);
    expect(
      shouldReapSessionOrphans({ activeSessionCount: 1, directMcpCallDepth: 1 }),
    ).toBe(false);
  });

  it("refuses while Drift's own direct MCP call is in flight", () => {
    // T-08-28: `callMcpMethod`'s spawn is argv-identical to a CLI's child.
    expect(
      shouldReapSessionOrphans({ activeSessionCount: 0, directMcpCallDepth: 1 }),
    ).toBe(false);
  });

  it("refuses on a negative count on either input", () => {
    // A negative count means the caller's arithmetic is wrong, and wrong
    // arithmetic is not evidence that nothing is running.
    expect(
      shouldReapSessionOrphans({ activeSessionCount: -1, directMcpCallDepth: 0 }),
    ).toBe(false);
    expect(
      shouldReapSessionOrphans({ activeSessionCount: 0, directMcpCallDepth: -1 }),
    ).toBe(false);
  });

  it("refuses on a non-integer on either input", () => {
    // `NaN` is the one that matters: it is FALSY, so a truthiness-based gate
    // would REAP on it. Fractions are included because a counter that has been
    // averaged or parsed is a counter nobody is tracking correctly.
    for (const bad of [Number.NaN, 0.5, Number.POSITIVE_INFINITY]) {
      expect(
        shouldReapSessionOrphans({
          activeSessionCount: bad,
          directMcpCallDepth: 0,
        }),
      ).toBe(false);
      expect(
        shouldReapSessionOrphans({
          activeSessionCount: 0,
          directMcpCallDepth: bad,
        }),
      ).toBe(false);
    }
  });
});
