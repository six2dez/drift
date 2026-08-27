import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildSpawnEnv,
  deriveWindowsSystemRoot,
  getExecutableNames,
  getHomeDirCandidates,
  getSweepRoots,
  getTempRoot,
  getWhichCommand,
  getWindowsNamedRoots,
  isAbsolutePath,
  isNvmWindowsInstalled,
  joinPath,
  normalizePlatform,
  rankPathSearchHits,
  resolveWindowsSystemBinary,
  selectComspec,
} from "./platform";

// Every Windows branch below is exercised with `platform` passed as a literal,
// which is the entire point of `platform.ts` being pure: the maintainer cannot
// run native Windows, so this suite is the win32 proof and it runs on the Linux
// CI runner. The describe/it titles are a CONTRACT with 04-VALIDATION.md, which
// addresses each row by `-t "<name>"` — renaming one silently unhooks a
// requirement from its verification.

describe("getTempRoot", () => {
  it("strips the trailing backslash GetTempPath2 returns on Windows", () => {
    expect(
      getTempRoot({
        platform: "win32",
        tmpdir: "C:\\Users\\x\\AppData\\Local\\Temp\\",
      }),
    ).toBe("C:\\Users\\x\\AppData\\Local\\Temp");
  });

  it("strips the trailing slash a launchd TMPDIR carries on macOS", () => {
    expect(
      getTempRoot({ platform: "darwin", tmpdir: "/var/folders/ab/cd/T/" }),
    ).toBe("/var/folders/ab/cd/T");
  });

  it("leaves an already-clean Linux tmpdir untouched", () => {
    expect(getTempRoot({ platform: "linux", tmpdir: "/tmp" })).toBe("/tmp");
  });

  it("preserves a filesystem root instead of reducing it to an empty string", () => {
    expect(getTempRoot({ platform: "linux", tmpdir: "/" })).toBe("/");
    expect(getTempRoot({ platform: "win32", tmpdir: "C:\\" })).toBe("C:\\");
  });

  it("trims surrounding whitespace before stripping separators", () => {
    expect(getTempRoot({ platform: "linux", tmpdir: "  /tmp//  " })).toBe(
      "/tmp",
    );
  });
});

describe("isAbsolutePath", () => {
  // The bug this prevents: under a POSIX-flavoured `path` — which this module
  // documents as the flavour the Linux runner resolves, and which is not
  // source-verified either way for Caido's LLRT — path.isAbsolute of a Windows
  // path is FALSE, so a Windows user with an absolute provider command falls
  // through to a `which` spawn that does not exist there.
  const windowsAbsolute = [
    "C:\\Users\\x\\AppData\\Roaming\\npm\\claude.cmd",
    "c:/Users/x/node.exe",
    "\\\\server\\share\\claude.cmd",
    "\\Windows\\System32\\where.exe",
  ];

  it("recognises Windows spellings on win32 and rejects them on POSIX", () => {
    for (const value of windowsAbsolute) {
      expect(isAbsolutePath({ value, platform: "win32" })).toBe(true);
    }
    for (const value of windowsAbsolute) {
      // "\\..." is a leading separator, which the POSIX arm does not accept
      // either, so every entry is false here.
      expect(isAbsolutePath({ value, platform: "linux" })).toBe(false);
      expect(isAbsolutePath({ value, platform: "darwin" })).toBe(false);
    }
  });

  it("recognises POSIX spellings on darwin and linux", () => {
    expect(
      isAbsolutePath({ value: "/usr/local/bin/node", platform: "darwin" }),
    ).toBe(true);
    expect(isAbsolutePath({ value: "/usr/bin/node", platform: "linux" })).toBe(
      true,
    );
    // A forward-slash root is absolute on win32 too — Node's win32
    // path.isAbsolute accepts it.
    expect(isAbsolutePath({ value: "/usr/bin/node", platform: "win32" })).toBe(
      true,
    );
  });

  it("rejects relative and drive-relative values on every platform", () => {
    // A bare "C:" is drive-RELATIVE, the same string getTempRoot refuses to
    // strip to nothing for the same reason.
    for (const value of [
      "",
      "claude",
      "./claude",
      "..\\claude.cmd",
      "C:",
      "C:claude.cmd",
    ]) {
      expect(isAbsolutePath({ value, platform: "win32" })).toBe(false);
      expect(isAbsolutePath({ value, platform: "linux" })).toBe(false);
      expect(isAbsolutePath({ value, platform: undefined })).toBe(false);
    }
  });

  it("accepts either spelling when the platform is not yet known", () => {
    // resolveCommand is reachable from a provider status check before the RUN-05
    // probe has run. The caller is choosing between "stat this" and "spawn a
    // PATH search", so the generous answer is the one that fails safe.
    expect(
      isAbsolutePath({ value: "/usr/bin/node", platform: undefined }),
    ).toBe(true);
    expect(
      isAbsolutePath({
        value: "C:\\Program Files\\nodejs\\node.exe",
        platform: undefined,
      }),
    ).toBe(true);
  });
});

describe("getSweepRoots", () => {
  it("adds the legacy /tmp arm on macOS where tmpdir is /var/folders", () => {
    expect(
      getSweepRoots({ platform: "darwin", tmpdir: "/var/folders/ab/cd/T/" }),
    ).toEqual(["/var/folders/ab/cd/T", "/tmp"]);
  });

  it("does not add /tmp on Windows", () => {
    expect(
      getSweepRoots({
        platform: "win32",
        tmpdir: "C:\\Users\\x\\AppData\\Local\\Temp\\",
      }),
    ).toEqual(["C:\\Users\\x\\AppData\\Local\\Temp"]);
  });

  it("does not duplicate /tmp on Linux", () => {
    expect(getSweepRoots({ platform: "linux", tmpdir: "/tmp" })).toEqual([
      "/tmp",
    ]);
  });
});

// G-01 — a Windows system root that does not come from the parent environment.
//
// WHY A DERIVATION IS THE ANSWER AT ALL. The 2026-08-27 diagnostics from a real
// Caido install report `parentEnvKeyCount: 0`: the environment the backend sees
// is EMPTY, so every environment-sourced system root in this codebase resolves
// to nothing and falls through to a bare executable name. `os.tmpdir()` is
// confirmed working on that same install and is the one non-environment source
// of a Windows path the runtime offers.
//
// Every case below drives the function with a LITERAL tmpdir, which is the whole
// point of it taking one: the maintainer cannot run native Windows, so the win32
// answers are proven here, on a POSIX host.
describe("deriveWindowsSystemRoot", () => {
  it("derives the root from a Windows temp directory's drive letter", () => {
    expect(
      deriveWindowsSystemRoot({
        tmpdir: "C:\\Users\\x\\AppData\\Local\\Temp",
      }),
    ).toBe("C:\\Windows");
  });

  it("upper-cases the drive letter and spells the win32 separator by hand", () => {
    // A forward-slash spelling and a lower-case drive both occur in the wild.
    // The separator is written by hand rather than with `path`, which resolves
    // to its POSIX flavour on this runner and would compose "D:/Windows".
    expect(deriveWindowsSystemRoot({ tmpdir: "d:/tmp" })).toBe("D:\\Windows");
  });

  it("derives nothing from a POSIX temp root", () => {
    // CMP-01 in its cheapest form: macOS and Linux fall out empty on SHAPE
    // alone, with no platform gate, so no POSIX arm can ever consult this.
    expect(deriveWindowsSystemRoot({ tmpdir: "/var/folders/05/abc/T" })).toBe(
      "",
    );
    expect(deriveWindowsSystemRoot({ tmpdir: "/tmp" })).toBe("");
  });

  it("derives nothing from a UNC path, which carries no drive letter", () => {
    // There is nothing to derive: the first character is a separator, not a
    // letter. Guessing here would be the silent-wrong-answer this whole rung
    // exists to replace.
    expect(
      deriveWindowsSystemRoot({ tmpdir: "\\\\server\\share\\tmp" }),
    ).toBe("");
  });

  it("derives nothing from an absent, empty or whitespace-only tmpdir", () => {
    expect(deriveWindowsSystemRoot({ tmpdir: undefined })).toBe("");
    expect(deriveWindowsSystemRoot({ tmpdir: "" })).toBe("");
    expect(deriveWindowsSystemRoot({ tmpdir: "   " })).toBe("");
  });

  it("derives nothing from a drive-RELATIVE prefix", () => {
    // "C:" and "C:tmp" are drive-relative, not rooted — the same rule
    // `isAbsolutePath` and `getTempRoot` already apply to the identical string.
    expect(deriveWindowsSystemRoot({ tmpdir: "C" })).toBe("");
    expect(deriveWindowsSystemRoot({ tmpdir: "C:" })).toBe("");
    expect(deriveWindowsSystemRoot({ tmpdir: "C:tmp" })).toBe("");
  });
});

// T-08-03 / T-08-33 / T-08-34 — the one ladder, asserted rung by rung.
//
// Environment first (the MEASURED root), then the derived fallback, then the
// bare name. The bare name is the documented last resort and is kept reachable
// and tested rather than deleted, which is what makes SC-1's "last resort"
// clause true rather than merely written.
describe("resolveWindowsSystemBinary", () => {
  it("prefers the environment value over the fallback", () => {
    expect(
      resolveWindowsSystemBinary({
        env: { SystemRoot: "C:\\Windows" },
        fallbackRoot: "D:\\Windows",
        binary: "taskkill.exe",
      }),
    ).toBe("C:\\Windows\\System32\\taskkill.exe");
  });

  it("uses the fallback root when the environment carries nothing", () => {
    // The arm a real install reaches, because its environment is empty.
    expect(
      resolveWindowsSystemBinary({
        env: {},
        fallbackRoot: "D:\\Windows",
        binary: "taskkill.exe",
      }),
    ).toBe("D:\\Windows\\System32\\taskkill.exe");
  });

  it("falls back to the BARE name only when neither root is available", () => {
    expect(
      resolveWindowsSystemBinary({
        env: {},
        fallbackRoot: "",
        binary: "taskkill.exe",
      }),
    ).toBe("taskkill.exe");
  });

  it("reads both casings, the native spelling winning", () => {
    expect(
      resolveWindowsSystemBinary({
        env: { SYSTEMROOT: "E:\\Windows" },
        fallbackRoot: "",
        binary: "where.exe",
      }),
    ).toBe("E:\\Windows\\System32\\where.exe");
    expect(
      resolveWindowsSystemBinary({
        env: { SystemRoot: "D:\\Windows", SYSTEMROOT: "E:\\Elsewhere" },
        fallbackRoot: "",
        binary: "where.exe",
      }),
    ).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("treats a whitespace-only value as ABSENT on BOTH rungs", () => {
    expect(
      resolveWindowsSystemBinary({
        env: { SystemRoot: "   " },
        fallbackRoot: "D:\\Windows",
        binary: "cmd.exe",
      }),
    ).toBe("D:\\Windows\\System32\\cmd.exe");
    expect(
      resolveWindowsSystemBinary({
        env: { SystemRoot: undefined },
        fallbackRoot: "   ",
        binary: "cmd.exe",
      }),
    ).toBe("cmd.exe");
  });

  it("strips trailing separators from EITHER root before joining", () => {
    expect(
      resolveWindowsSystemBinary({
        env: { SystemRoot: "D:\\Windows\\" },
        fallbackRoot: "",
        binary: "where.exe",
      }),
    ).toBe("D:\\Windows\\System32\\where.exe");
    expect(
      resolveWindowsSystemBinary({
        env: {},
        fallbackRoot: "D:\\Windows/",
        binary: "where.exe",
      }),
    ).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("keeps the deliberate absence of a bare-drive guard", () => {
    // A segment is being APPENDED rather than a root preserved, so reducing
    // "D:\" to "D:" yields the correct "D:\System32\…" — the same reasoning
    // `getWhichCommand` and `buildKillTreePlan` each carried before the merge.
    expect(
      resolveWindowsSystemBinary({
        env: { SystemRoot: "D:\\" },
        fallbackRoot: "",
        binary: "taskkill.exe",
      }),
    ).toBe("D:\\System32\\taskkill.exe");
  });

  it("treats a NON-STRING fallbackRoot as empty and lands on the bare name", () => {
    // This simulates an UN-UPDATED TEST CALL SITE, not any reachable production
    // input: `packages/backend/tsconfig.json` excludes `./src/**/*.test.ts`, so
    // `pnpm -r typecheck` cannot catch a test that omits the required member,
    // and vitest transpiles it without checking. Such a call arrives here
    // carrying no value at all.
    //
    // RED INPUT: drop the non-string coercion from `resolveWindowsSystemBinary`
    // and the composed value becomes a plausible-looking absolute path built
    // from the absent value's NAME, resolving to nothing — quietly wrong in the
    // one function whose purpose is to stop a bare name reaching Windows'
    // search order. The malformed literal is deliberately NOT spelled in this
    // assertion: a negative grep over `packages/backend/src` guards it, and
    // writing it here would turn that gate red against its own test.
    const resolved = resolveWindowsSystemBinary({
      env: {},
      fallbackRoot: undefined as unknown as string,
      binary: "taskkill.exe",
    });
    expect(resolved).toBe("taskkill.exe");
    expect(resolved).not.toContain("System32");
    expect(resolved).not.toContain("undefined");
  });
});

// G-01 / T-08-34 — the fallback rung between the environment read and the bare
// name.
//
// THE RULE FOR THIS BLOCK, stated so it cannot be quietly broken: folding this
// function's win32 ladder into `resolveWindowsSystemBinary` is a REFACTOR. Every
// pre-existing expectation below is reproduced BYTE FOR BYTE, because those
// cases pass an EMPTY `systemRootFallback` and an empty fallback reproduces the
// old ladder exactly. The only edit permitted to a pre-existing case is the
// added input member. If an expectation has to move, the consolidation is wrong
// and the work halts — the expectation is not the thing to update.
//
// RED INPUT for the new fallback rung: delete the `fallbackRoot` branch from
// `resolveWindowsSystemBinary` and the two empty-env-with-fallback cases below
// return the bare "where.exe" instead of the fallback-rooted absolute path.
describe("getWhichCommand", () => {
  it("resolves with which on darwin and linux", () => {
    expect(getWhichCommand({ platform: "darwin", env: {}, systemRootFallback: "" }).command).toBe(
      "which",
    );
    expect(getWhichCommand({ platform: "linux", env: {}, systemRootFallback: "" }).command).toBe(
      "which",
    );
  });

  it("resolves with where.exe on win32", () => {
    expect(getWhichCommand({ platform: "win32", env: {}, systemRootFallback: "" }).command).toBe(
      "where.exe",
    );
  });

  it("passes the command as a single argument on every platform", () => {
    expect(
      getWhichCommand({ platform: "darwin", env: {}, systemRootFallback: "" }).args("node"),
    ).toEqual(["node"]);
    expect(
      getWhichCommand({ platform: "linux", env: {}, systemRootFallback: "" }).args("node"),
    ).toEqual(["node"]);
    expect(
      getWhichCommand({ platform: "win32", env: {}, systemRootFallback: "" }).args("node"),
    ).toEqual(["node"]);
  });

  it("invokes the search binary by absolute path under the machine's own system root", () => {
    // A NON-C drive on purpose: the root is READ from the environment, never
    // assumed. Phase 3 measured the C:\Windows spelling on the runner, and
    // hardcoding that literal was rejected — see the comment on the function.
    expect(
      getWhichCommand({ platform: "win32", env: { SystemRoot: "D:\\Windows" }, systemRootFallback: "" })
        .command,
    ).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("honours the SCREAMING-case spelling, and prefers the native-cased key when both are present", () => {
    expect(
      getWhichCommand({ platform: "win32", env: { SYSTEMROOT: "E:\\Windows" }, systemRootFallback: "" })
        .command,
    ).toBe("E:\\Windows\\System32\\where.exe");
    expect(
      getWhichCommand({
        platform: "win32",
        env: { SystemRoot: "D:\\Windows", SYSTEMROOT: "E:\\Elsewhere" },
        systemRootFallback: "",
      }).command,
    ).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("falls back to the bare binary name when the variable is missing or blank", () => {
    // The fallback is load-bearing, not padding: the variable's presence rests
    // on libuv's back-fill list, which is Node's, and Caido's runtime is not
    // Node. This case is why the arm is not dead code.
    expect(getWhichCommand({ platform: "win32", env: {}, systemRootFallback: "" }).command).toBe(
      "where.exe",
    );
    expect(
      getWhichCommand({ platform: "win32", env: { SystemRoot: "   " }, systemRootFallback: "" })
        .command,
    ).toBe("where.exe");
    expect(
      getWhichCommand({ platform: "win32", env: { SystemRoot: undefined }, systemRootFallback: "" })
        .command,
    ).toBe("where.exe");
  });

  it("uses the DERIVED root when the environment carries none (G-01)", () => {
    // The MEASURED condition, not a contingency: the environment Caido's
    // backend sees is empty on a real install, so this is the arm a Windows
    // user actually reaches. Before this rung existed it was the bare name.
    expect(
      getWhichCommand({
        platform: "win32",
        env: {},
        systemRootFallback: "D:\\Windows",
      }).command,
    ).toBe("D:\\Windows\\System32\\where.exe");
    expect(
      getWhichCommand({
        platform: "win32",
        env: { SystemRoot: "   " },
        systemRootFallback: "D:\\Windows",
      }).command,
    ).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("prefers a populated environment over the derived root", () => {
    // A REGRESSION guard rather than a proof of new behaviour, and it is worth
    // saying which: this case was already green before the fallback rung
    // existed, because the environment rung did. It is here so the derivation —
    // which `TEMP` redirected across drives can get wrong — can never overtake
    // the measurement.
    expect(
      getWhichCommand({
        platform: "win32",
        env: { SystemRoot: "D:\\Windows" },
        systemRootFallback: "E:\\Windows",
      }).command,
    ).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("does not double the separator for a root that already ends in one", () => {
    expect(
      getWhichCommand({
        platform: "win32",
        env: { SystemRoot: "D:\\Windows\\" },
        systemRootFallback: "",
      }).command,
    ).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("resolves with which before the platform probe has run", () => {
    // Pre-probe. Only ONE binary can be spawned, so unlike getHomeDirCandidates
    // there is no union answer here; the POSIX arm reproduces today's behaviour
    // on every platform exactly (CMP-01).
    expect(
      getWhichCommand({
        platform: undefined,
        env: { SystemRoot: "D:\\Windows" },
        systemRootFallback: "",
      }).command,
    ).toBe("which");
    expect(
      getWhichCommand({ platform: undefined, env: {}, systemRootFallback: "" }).args("node"),
    ).toEqual(["node"]);
  });
});

describe("getExecutableNames", () => {
  it("returns the bare command unchanged on POSIX", () => {
    expect(getExecutableNames({ command: "node", platform: "darwin" })).toEqual(
      ["node"],
    );
    expect(getExecutableNames({ command: "node", platform: "linux" })).toEqual([
      "node",
    ]);
  });

  it("returns the .exe/.cmd/.bat ladder with the bare name last on win32", () => {
    expect(getExecutableNames({ command: "node", platform: "win32" })).toEqual([
      "node.exe",
      "node.cmd",
      "node.bat",
      "node",
    ]);
  });

  it("leaves an already-extensioned win32 path alone", () => {
    expect(
      getExecutableNames({
        command: "C:\\Program Files\\nodejs\\node.exe",
        platform: "win32",
      }),
    ).toEqual(["C:\\Program Files\\nodejs\\node.exe"]);
  });

  it("matches an existing extension case-insensitively", () => {
    expect(
      getExecutableNames({ command: "claude.CMD", platform: "win32" }),
    ).toEqual(["claude.CMD"]);
  });

  it("returns nothing for an empty or whitespace-only command", () => {
    expect(getExecutableNames({ command: "   ", platform: "win32" })).toEqual(
      [],
    );
    expect(getExecutableNames({ command: "", platform: "linux" })).toEqual([]);
  });
});

describe("rankPathSearchHits", () => {
  // The PATH-search tool prints every PATH x PATHEXT hit, one full path per
  // line, and its order ACROSS extensions is undocumented — so the ".exe"
  // preference SC-2 asks for has to be RANKED here rather than read off the
  // first line, which would make it an accident of the machine's PATH.
  it("ranks the .exe hit ahead of the .cmd hit ahead of the .bat hit on win32", () => {
    expect(
      rankPathSearchHits({
        platform: "win32",
        lines: ["C:\\a\\claude.cmd", "C:\\b\\claude.exe", "C:\\c\\claude.bat"],
      }),
    ).toEqual(["C:\\b\\claude.exe", "C:\\a\\claude.cmd", "C:\\c\\claude.bat"]);
  });

  it("keeps the search tool's own emission order as the tie-break within one extension", () => {
    expect(
      rankPathSearchHits({
        platform: "win32",
        lines: ["C:\\first\\claude.exe", "C:\\second\\claude.exe"],
      }),
    ).toEqual(["C:\\first\\claude.exe", "C:\\second\\claude.exe"]);
  });

  it("produces no candidate for the no-match informational sentence", () => {
    // 06-RESEARCH § Pitfall 1 requires this assertion by name: the stream that
    // sentence is written to is undocumented, so it can land in the same buffer
    // the paths do. The extension-termination filter is the second of two
    // independent guards; the first is the exit-code gate at the call site.
    expect(
      rankPathSearchHits({
        platform: "win32",
        lines: ["INFO: Could not find files for the given pattern(s)."],
      }),
    ).toEqual([]);
  });

  it("discards the partial final line the bounded output buffer leaves above its cap", () => {
    expect(
      rankPathSearchHits({
        platform: "win32",
        lines: ["C:\\a\\claude.exe", "C:\\b\\clau"],
      }),
    ).toEqual(["C:\\a\\claude.exe"]);
  });

  it("ranks an uppercase extension with its group and returns the original spelling", () => {
    expect(
      rankPathSearchHits({
        platform: "win32",
        lines: ["C:\\a\\claude.CMD", "C:\\b\\claude.EXE"],
      }),
    ).toEqual(["C:\\b\\claude.EXE", "C:\\a\\claude.CMD"]);
  });

  it("trims carriage returns and surrounding whitespace and drops empty lines", () => {
    expect(
      rankPathSearchHits({
        platform: "win32",
        lines: ["C:\\a\\claude.cmd\r", "", "  C:\\b\\claude.exe  \r", "   "],
      }),
    ).toEqual(["C:\\b\\claude.exe", "C:\\a\\claude.cmd"]);
  });

  it("returns nothing for an empty win32 line list", () => {
    expect(rankPathSearchHits({ platform: "win32", lines: [] })).toEqual([]);
  });

  it("returns exactly the first line on darwin and linux", () => {
    expect(
      rankPathSearchHits({
        platform: "linux",
        lines: ["/usr/bin/claude", "/usr/local/bin/claude"],
      }),
    ).toEqual(["/usr/bin/claude"]);
    expect(
      rankPathSearchHits({
        platform: "darwin",
        lines: ["/opt/homebrew/bin/claude", "/usr/bin/claude"],
      }),
    ).toEqual(["/opt/homebrew/bin/claude"]);
  });

  it("returns nothing for an empty or blank POSIX result", () => {
    expect(rankPathSearchHits({ platform: "linux", lines: [""] })).toEqual([]);
    expect(rankPathSearchHits({ platform: "linux", lines: [] })).toEqual([]);
    expect(rankPathSearchHits({ platform: "linux", lines: ["   "] })).toEqual(
      [],
    );
  });

  it("takes the POSIX arm before the platform probe has run", () => {
    // `platform: undefined` is pre-probe. Unlike getHomeDirCandidates there is
    // no union answer available here — only one binary can be spawned — so this
    // arm reproduces today's single-line extraction exactly (CMP-01).
    expect(
      rankPathSearchHits({
        platform: undefined,
        lines: ["/usr/bin/claude", "/usr/local/bin/claude"],
      }),
    ).toEqual(["/usr/bin/claude"]);
  });

  it("reproduces the single-line extraction it replaces, byte for byte", () => {
    // CMP-01 for D-01. The extraction in index.ts's PATH-search close handler
    // is `out.head.split("\n", 1)[0]?.trim() ?? ""`; the POSIX arm must return
    // that same string and nothing else.
    const head = "/usr/local/bin/node\n/usr/bin/node\n";
    const legacy = head.split("\n", 1)[0]?.trim() ?? "";
    expect(
      rankPathSearchHits({ platform: "linux", lines: head.split(/\r?\n/) }),
    ).toEqual([legacy]);
  });
});

describe("getHomeDirCandidates", () => {
  it("reads HOME on POSIX and ignores USERPROFILE", () => {
    expect(
      getHomeDirCandidates({
        platform: "darwin",
        env: { HOME: "/Users/six", USERPROFILE: "C:\\Users\\six" },
      }),
    ).toEqual(["/Users/six"]);
  });

  it("reads USERPROFILE, APPDATA and LOCALAPPDATA in that order on win32", () => {
    expect(
      getHomeDirCandidates({
        platform: "win32",
        env: {
          HOME: "/home/six",
          USERPROFILE: "C:\\Users\\six",
          APPDATA: "C:\\Users\\six\\AppData\\Roaming",
          LOCALAPPDATA: "C:\\Users\\six\\AppData\\Local",
        },
      }),
    ).toEqual([
      "C:\\Users\\six",
      "C:\\Users\\six\\AppData\\Roaming",
      "C:\\Users\\six\\AppData\\Local",
    ]);
  });

  it("returns a value repeated across two Windows variables only once", () => {
    expect(
      getHomeDirCandidates({
        platform: "win32",
        env: {
          USERPROFILE: "C:\\Users\\six",
          APPDATA: "C:\\Users\\six",
          LOCALAPPDATA: "C:\\Users\\six\\AppData\\Local",
        },
      }),
    ).toEqual(["C:\\Users\\six", "C:\\Users\\six\\AppData\\Local"]);
  });

  it("drops undefined, empty and whitespace-only values", () => {
    expect(
      getHomeDirCandidates({
        platform: "win32",
        env: {
          USERPROFILE: "",
          APPDATA: "   ",
          LOCALAPPDATA: "  C:\\Users\\six\\AppData\\Local  ",
        },
      }),
    ).toEqual(["C:\\Users\\six\\AppData\\Local"]);
    expect(getHomeDirCandidates({ platform: "linux", env: {} })).toEqual([]);
  });

  // Pre-probe (`platform: undefined`) reads BOTH name sets. The whole-array
  // toEqual shape is deliberate: order is part of the contract, so a membership
  // assertion would not state it.
  it("unions both name sets before the platform probe has run", () => {
    expect(
      getHomeDirCandidates({
        platform: undefined,
        env: {
          HOME: "/home/six",
          USERPROFILE: "C:\\Users\\six",
          APPDATA: "C:\\Users\\six\\AppData\\Roaming",
          LOCALAPPDATA: "C:\\Users\\six\\AppData\\Local",
        },
      }),
    ).toEqual([
      "/home/six",
      "C:\\Users\\six",
      "C:\\Users\\six\\AppData\\Roaming",
      "C:\\Users\\six\\AppData\\Local",
    ]);
  });

  it("costs a POSIX machine nothing pre-probe", () => {
    // CMP-01: the Windows names are simply absent on macOS and Linux, so the
    // union returns exactly what the POSIX-only arm returned.
    expect(
      getHomeDirCandidates({ platform: undefined, env: { HOME: "/home/six" } }),
    ).toEqual(["/home/six"]);
  });

  it("reads the Windows variables pre-probe rather than returning nothing", () => {
    // The case a POSIX default would turn into an empty array on Windows —
    // every provider status check before MCP start would then report all four
    // CLIs unavailable, which is very close to the symptom this milestone
    // exists to fix.
    expect(
      getHomeDirCandidates({
        platform: undefined,
        env: { USERPROFILE: "C:\\Users\\six" },
      }),
    ).toEqual(["C:\\Users\\six"]);
  });

  it("emits a value shared by a POSIX and a Windows name only once pre-probe", () => {
    expect(
      getHomeDirCandidates({
        platform: undefined,
        env: { HOME: "/home/six", USERPROFILE: "/home/six", APPDATA: "   " },
      }),
    ).toEqual(["/home/six"]);
  });
});

describe("normalizePlatform", () => {
  it("accepts the three platforms the narrow union covers", () => {
    expect(normalizePlatform("win32")).toBe("win32");
    expect(normalizePlatform("darwin")).toBe("darwin");
    expect(normalizePlatform("linux")).toBe("linux");
  });

  it("rejects an unrecognised value instead of falling through to POSIX", () => {
    // LLRT's third PLATFORM arm is std::env::consts::OS, so these are values
    // the runtime really can report. Falling through would reintroduce the
    // reported Windows bug one layer up (D-06 / RUN-05).
    expect(normalizePlatform("freebsd")).toBeUndefined();
    expect(normalizePlatform("android")).toBeUndefined();
  });

  it("rejects empty, whitespace-only and undefined input", () => {
    expect(normalizePlatform("")).toBeUndefined();
    expect(normalizePlatform("  ")).toBeUndefined();
    expect(normalizePlatform(undefined)).toBeUndefined();
  });

  it("trims surrounding whitespace before checking the allow-list", () => {
    expect(normalizePlatform("  win32  ")).toBe("win32");
  });
});

describe("buildSpawnEnv", () => {
  it("preserves parent variables that libuv does not back-fill on Windows", () => {
    const env = buildSpawnEnv({
      parentEnv: {
        APPDATA: "C:\\Users\\x\\AppData\\Roaming",
        LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local",
      },
      driftVars: { CAIDO_TOKEN: "t" },
    });
    expect(env["APPDATA"]).toBe("C:\\Users\\x\\AppData\\Roaming");
    expect(env["LOCALAPPDATA"]).toBe("C:\\Users\\x\\AppData\\Local");
    expect(env["CAIDO_TOKEN"]).toBe("t");
  });

  it("lets a drift var override a same-named parent variable", () => {
    const env = buildSpawnEnv({
      parentEnv: { CAIDO_TOKEN: "stale", PATH: "/usr/bin" },
      driftVars: { CAIDO_TOKEN: "fresh" },
    });
    expect(env["CAIDO_TOKEN"]).toBe("fresh");
    expect(env["PATH"]).toBe("/usr/bin");
  });

  it("drops undefined-valued parent entries", () => {
    const env = buildSpawnEnv({
      parentEnv: { PRESENT: "yes", ABSENT: undefined },
      driftVars: {},
    });
    expect(env).toEqual({ PRESENT: "yes" });
    expect(Object.keys(env)).not.toContain("ABSENT");
  });

  it("returns a new object rather than mutating parentEnv", () => {
    const parentEnv: Record<string, string | undefined> = { PATH: "/usr/bin" };
    const env = buildSpawnEnv({ parentEnv, driftVars: { CAIDO_TOKEN: "t" } });
    expect(env).not.toBe(parentEnv);
    expect(parentEnv["CAIDO_TOKEN"]).toBeUndefined();
    expect(Object.keys(parentEnv)).toEqual(["PATH"]);
  });
});

describe("joinPath", () => {
  it("spells a Windows candidate with backslashes on win32", () => {
    expect(
      joinPath({
        platform: "win32",
        segments: ["C:\\Users\\six\\AppData\\Roaming", "npm", "claude.exe"],
      }),
    ).toBe("C:\\Users\\six\\AppData\\Roaming\\npm\\claude.exe");
  });

  it("spells a POSIX candidate with forward slashes on linux", () => {
    expect(
      joinPath({ platform: "linux", segments: ["/opt/homebrew/bin", "claude"] }),
    ).toBe("/opt/homebrew/bin/claude");
  });

  it("takes the POSIX arm before the RUN-05 probe has resolved a platform", () => {
    expect(
      joinPath({ platform: undefined, segments: ["/usr/local/bin", "claude"] }),
    ).toBe("/usr/local/bin/claude");
  });

  it("returns the empty string for an empty segment list", () => {
    expect(joinPath({ platform: "linux", segments: [] })).toBe("");
    expect(joinPath({ platform: "win32", segments: [] })).toBe("");
  });

  it("drops an empty or whitespace-only segment instead of doubling the separator", () => {
    expect(joinPath({ platform: "linux", segments: ["/home/x", "", "bin"] })).toBe(
      "/home/x/bin",
    );
    expect(joinPath({ platform: "linux", segments: ["/home/x", "   ", "bin"] })).toBe(
      "/home/x/bin",
    );
  });

  it("emits exactly one separator at a seam that already carries one", () => {
    expect(joinPath({ platform: "linux", segments: ["/home/x/", ".local"] })).toBe(
      "/home/x/.local",
    );
    expect(joinPath({ platform: "linux", segments: ["/home/x", "/.local"] })).toBe(
      "/home/x/.local",
    );
    expect(joinPath({ platform: "win32", segments: ["C:\\", "Users"] })).toBe(
      "C:\\Users",
    );
    expect(
      joinPath({ platform: "win32", segments: ["C:\\Users\\", "\\six"] }),
    ).toBe("C:\\Users\\six");
  });

  it("preserves the first segment's own leading separator", () => {
    expect(joinPath({ platform: "linux", segments: ["/", "usr", "bin"] })).toBe(
      "/usr/bin",
    );
    expect(joinPath({ platform: "linux", segments: ["relative", "bin"] })).toBe(
      "relative/bin",
    );
  });
});

describe("getWindowsNamedRoots", () => {
  it("leaves every field absent when the environment carries none of them", () => {
    const roots = getWindowsNamedRoots({ env: {} });
    // Object.keys rather than toEqual({}): toEqual ignores a
    // present-but-undefined property, so it cannot tell "absent" from
    // "present and empty" — and an empty prefix is exactly the T-06-T02 threat
    // (a relative path resolved against the process working directory).
    expect(Object.keys(roots)).toEqual([]);
  });

  it("reads all six named roots from their native-cased variables", () => {
    expect(
      getWindowsNamedRoots({
        env: {
          USERPROFILE: "C:\\Users\\six",
          APPDATA: "C:\\Users\\six\\AppData\\Roaming",
          LOCALAPPDATA: "C:\\Users\\six\\AppData\\Local",
          ProgramFiles: "C:\\Program Files",
          "ProgramFiles(x86)": "C:\\Program Files (x86)",
          ProgramData: "C:\\ProgramData",
        },
      }),
    ).toEqual({
      userProfile: "C:\\Users\\six",
      appData: "C:\\Users\\six\\AppData\\Roaming",
      localAppData: "C:\\Users\\six\\AppData\\Local",
      programFiles: "C:\\Program Files",
      programFilesX86: "C:\\Program Files (x86)",
      programData: "C:\\ProgramData",
    });
  });

  it("falls back to the SCREAMING-case spelling when the native-cased key is absent", () => {
    expect(
      getWindowsNamedRoots({
        env: {
          PROGRAMFILES: "C:\\Program Files",
          "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
          PROGRAMDATA: "C:\\ProgramData",
        },
      }),
    ).toEqual({
      programFiles: "C:\\Program Files",
      programFilesX86: "C:\\Program Files (x86)",
      programData: "C:\\ProgramData",
    });
  });

  it("prefers the native-cased key when both spellings are present", () => {
    expect(
      getWindowsNamedRoots({
        env: {
          ProgramFiles: "C:\\Program Files",
          PROGRAMFILES: "D:\\Elsewhere",
        },
      }),
    ).toEqual({ programFiles: "C:\\Program Files" });
  });

  it("treats a whitespace-only value as absent rather than as an empty prefix", () => {
    const roots = getWindowsNamedRoots({ env: { APPDATA: "   ", USERPROFILE: "" } });
    expect(Object.keys(roots)).toEqual([]);
  });
});

// CR-02. The gate on the one drive-qualified literal in the candidate
// catalogue, C:\nvm4w\nodejs. C:\ grants BUILTIN\Users create-folder rights,
// so that directory is creatable by a non-administrator on a machine where
// nvm-windows was never installed — and a binary resolved from it is spawned
// with CAIDO_TOKEN in its environment. The signal this function reads is the
// nvm-windows installer's own environment contract (nvm.iss writes NVM_HOME and
// NVM_SYMLINK), so a real nvm-windows user keeps the coverage and a bare
// machine loses the row.
//
// Pure and env-INJECTED, like every other helper in this file: the answer is
// assertable from literal inputs on the Linux runner, and the candidate builders
// it feeds never read process.env themselves (D-10 / SC-5).
describe("isNvmWindowsInstalled", () => {
  it("answers false for an empty environment", () => {
    expect(isNvmWindowsInstalled({ env: {} })).toBe(false);
  });

  it("answers true when NVM_HOME is set", () => {
    expect(
      isNvmWindowsInstalled({ env: { NVM_HOME: "C:\\Users\\six\\AppData\\Local\\nvm" } }),
    ).toBe(true);
  });

  it("answers true when only NVM_SYMLINK is set", () => {
    expect(
      isNvmWindowsInstalled({ env: { NVM_SYMLINK: "C:\\nvm4w\\nodejs" } }),
    ).toBe(true);
  });

  it("accepts the lowercase spelling of either name", () => {
    expect(isNvmWindowsInstalled({ env: { nvm_home: "C:\\nvm" } })).toBe(true);
    expect(isNvmWindowsInstalled({ env: { nvm_symlink: "C:\\nvm4w\\nodejs" } })).toBe(
      true,
    );
  });

  it("treats an empty or whitespace-only value as ABSENT", () => {
    // The same present-but-empty rule getWindowsNamedRoots applies. A declared
    // but unset variable must not switch a non-admin-writable row back on.
    expect(isNvmWindowsInstalled({ env: { NVM_HOME: "", NVM_SYMLINK: "   " } })).toBe(
      false,
    );
  });

  it("ignores unrelated variables, including a same-prefix decoy", () => {
    expect(
      isNvmWindowsInstalled({
        env: {
          USERPROFILE: "C:\\Users\\six",
          NVM_DIR: "/home/six/.nvm",
          NVM_HOME_DIR: "C:\\nope",
        },
      }),
    ).toBe(false);
  });
});

// CR-01 — the interpreter buildSpawnPlan is handed instead of the bare name.
//
// The hole this closes is not hypothetical arithmetic: `CreateProcess` resolves
// an unqualified application name through a search order that includes the
// CURRENT WORKING DIRECTORY, Caido's plugin host chooses that directory, and the
// cmd.exe arm is the one that carries `codex mcp add ... --env
// CAIDO_TOKEN=<literal>` on its argv. Every case below is driven with `platform`
// as a literal, so the win32 answers are proven on the Linux runner.
describe("selectComspec", () => {
  const windowsComspec = "C:\\WINDOWS\\system32\\cmd.exe";

  it("returns the absolute COMSPEC verbatim on win32", () => {
    expect(selectComspec({ env: { COMSPEC: windowsComspec }, platform: "win32", systemRootFallback: "" })).toBe(
      windowsComspec,
    );
  });

  it("accepts cmd.exe's own `ComSpec` spelling", () => {
    // The spelling cmd.exe actually exports. `process.env` is case-INsensitive
    // on Windows only, and Caido's backend runtime is LLRT rather than Node, so
    // a single-cased property access is not guaranteed to reach it.
    expect(selectComspec({ env: { ComSpec: windowsComspec }, platform: "win32", systemRootFallback: "" })).toBe(
      windowsComspec,
    );
  });

  it("accepts the all-lowercase spelling upstream cross-spawn reads", () => {
    // Upstream's literal is `process.env.comspec`.
    expect(selectComspec({ env: { comspec: windowsComspec }, platform: "win32", systemRootFallback: "" })).toBe(
      windowsComspec,
    );
  });

  it("trims surrounding whitespace off the value it returns", () => {
    expect(
      selectComspec({ env: { COMSPEC: `  ${windowsComspec}  ` }, platform: "win32", systemRootFallback: "" }),
    ).toBe(windowsComspec);
  });

  it("returns undefined for an environment that declares no spelling", () => {
    expect(
      selectComspec({
        env: { PATH: "C:\\WINDOWS\\system32", USERPROFILE: "C:\\Users\\six" },
        platform: "win32",
        systemRootFallback: "",
      }),
    ).toBeUndefined();
  });

  it("treats an empty or whitespace-only value as ABSENT", () => {
    expect(selectComspec({ env: { COMSPEC: "" }, platform: "win32", systemRootFallback: "" })).toBeUndefined();
    expect(selectComspec({ env: { COMSPEC: "   " }, platform: "win32", systemRootFallback: "" })).toBeUndefined();
  });

  it("REFUSES a relative COMSPEC rather than passing it to a spawn", () => {
    // The whole point. A relative interpreter is resolved through the same
    // search order the absolute path exists to bypass, so accepting one would
    // close nothing. "C:cmd.exe" is drive-RELATIVE and belongs in this list.
    for (const relative of ["cmd.exe", ".\\cmd.exe", "system32\\cmd.exe", "C:cmd.exe"]) {
      expect(
        selectComspec({ env: { COMSPEC: relative }, platform: "win32", systemRootFallback: "" }),
      ).toBeUndefined();
    }
  });

  it("does not let a later spelling rescue a relative earlier one", () => {
    // Fail closed on the first spelling that carries a value. A rule where a
    // second casing of the same variable silently corrects the first is one no
    // caller could predict from the outside.
    expect(
      selectComspec({
        env: { COMSPEC: "cmd.exe", ComSpec: windowsComspec },
        platform: "win32",
        systemRootFallback: "",
      }),
    ).toBeUndefined();
  });

  it("uses the DERIVED root when no COMSPEC spelling carries a value (G-01)", () => {
    // THE PHASE 7 HOLE, reopened by the runtime rather than by an edit. CR-01
    // added this function so a bare "cmd.exe" would never reach a spawn that
    // carries CAIDO_TOKEN — and then the environment it reads turned out to be
    // EMPTY on every real install, so the loop above found nothing, returned
    // undefined, and `buildSpawnPlan` fell back to that bare name anyway. This
    // rung is what makes the mitigation actually run (T-08-33).
    expect(
      selectComspec({
        env: {},
        platform: "win32",
        systemRootFallback: "D:\\Windows",
      }),
    ).toBe("D:\\Windows\\System32\\cmd.exe");
  });

  it("prefers a COMSPEC the environment carries over the derived root", () => {
    expect(
      selectComspec({
        env: { COMSPEC: windowsComspec },
        platform: "win32",
        systemRootFallback: "D:\\Windows",
      }),
    ).toBe(windowsComspec);
  });

  it("still returns undefined when no root can be derived either", () => {
    // buildSpawnPlan keeps ownership of the last-resort bare name, exactly as
    // this function's comment says: the new rung sits BEFORE this answer, not
    // in place of it. An empty fallback composes the bare "cmd.exe", which is
    // not drive-absolute and is therefore refused here rather than passed on.
    expect(
      selectComspec({ env: {}, platform: "win32", systemRootFallback: "" }),
    ).toBeUndefined();
  });

  it("REFUSES a derived value that is not drive-absolute", () => {
    // The same rule the loop above applies to a value it read. A relative
    // interpreter is resolved through the very search order this function
    // exists to bypass, so its origin does not earn it an exemption.
    expect(
      selectComspec({
        env: {},
        platform: "win32",
        systemRootFallback: "   ",
      }),
    ).toBeUndefined();
  });

  it("CMP-01: does not consult the derived root on a POSIX platform", () => {
    // A non-win32 host takes buildSpawnPlan's passthrough arm and spawns no
    // interpreter at all, so a fallback reaching a POSIX plan could only ever
    // be wrong. The platform guard sits above both rungs, which is what makes
    // this byte-identical to today.
    for (const platform of ["darwin", "linux", undefined] as const) {
      expect(
        selectComspec({ env: {}, platform, systemRootFallback: "D:\\Windows" }),
      ).toBeUndefined();
    }
  });

  it("CMP-01: returns undefined on darwin, linux and an undefined platform", () => {
    // Those platforms take buildSpawnPlan's passthrough arm, which spawns no
    // interpreter at all. A COMSPEC exported by Wine or an msys shell must not
    // reach a plan that will never use one.
    for (const platform of ["darwin", "linux", undefined] as const) {
      expect(
        selectComspec({ env: { COMSPEC: windowsComspec }, platform, systemRootFallback: "" }),
      ).toBeUndefined();
    }
  });
});

// CMP-01 — the byte-identity proof for the D-05 sweep.
//
// 06-CONTEXT § Specific Ideas: "The POSIX output of D-05's `joinPath` should be
// asserted byte-identical to the current `path.join` output. That equality IS
// the CMP-01 proof for the sweep; do not leave it to review." This block is that
// assertion.
//
// The `path` import above is legitimate HERE and nowhere else in this module's
// orbit: it is the ORACLE, not the implementation. platform.ts refuses the
// import precisely because the module is host-flavoured — which is what makes it
// useless as an implementation and perfect as a comparison target.
// `grep -c 'from "path"'` over platform.ts itself still returns 0.
//
// The oracle is `path.posix`, NOT the bare `path`. That namespace is what makes
// this block's own claim — "a POSIX runner, where its flavour is POSIX by
// construction" — true by CONSTRUCTION rather than by accident of which runner
// happens to execute it. With the bare module the flavour follows the HOST, so
// on the blocking windows-latest leg the oracle turned win32 and these
// assertions compared /home/six/.local/bin/claude against
// \\home\\six\\.local\\bin\\claude: 25 red assertions for a reason that has nothing
// to do with joinPath (WINDOWS.md entry 7, measured by aliasing the `path`
// specifier to `path.win32`). `path.posix.join` is byte-identical to
// `path.join` on a POSIX host, so 06-01's CMP-01 evidence keeps its exact value
// and the expected strings below are unedited; it is simply also correct on
// win32. LLRT's missing `path.posix` namespace constrains the SHIPPED
// platform.ts, not a test file running under vitest on Node.
//
// The table below was enumerated from command-resolution.ts as it stands after
// this plan: the POSIX candidate rows at :184-196 (four absolute directories
// plus the seven home-relative suffixes), the version-manager suffixes at
// :129-141, and the node-only absolute rows at :271-278. It is iterated in a
// loop rather than written out as individual assertions so that a suffix added
// to the builders without a row here shows up as an omission a reader can spot,
// not as silence.
const CMP_01_HOME_DIRS = ["/home/six", "/Users/six2dez/"];

const cmp01AbsoluteRows: string[][] = [
  // command-resolution.ts:184-187
  ["/opt/homebrew/bin", "claude"],
  ["/usr/local/bin", "claude"],
  ["/usr/bin", "claude"],
  ["/bin", "claude"],
  // command-resolution.ts:271-273 — node-only
  ["/opt/homebrew/bin", "node"],
  ["/usr/local/bin", "node"],
  ["/usr/bin", "node"],
];

const cmp01HomeRows = (homeDir: string): string[][] => [
  // command-resolution.ts:190-196
  [homeDir, ".local", "bin", "claude"],
  [homeDir, ".volta", "bin", "claude"],
  [homeDir, ".asdf", "shims", "claude"],
  [homeDir, ".npm-global", "bin", "claude"],
  [homeDir, ".bun", "bin", "claude"],
  [homeDir, "Library", "pnpm", "claude"],
  [homeDir, ".local", "share", "pnpm", "claude"],
  // command-resolution.ts:129-141 — the two version-manager walks
  [homeDir, ".nvm", "versions", "node", "v22.1.0", "bin", "claude"],
  [homeDir, ".fnm", "node-versions", "v20.5.0", "installation", "bin", "claude"],
];

const cmp01Rows: string[][] = [
  ...cmp01AbsoluteRows,
  ...CMP_01_HOME_DIRS.flatMap((homeDir) => cmp01HomeRows(homeDir)),
];

describe("joinPath CMP-01 POSIX byte-identity", () => {
  for (const row of cmp01Rows) {
    it(`joins ${row.join(" + ")} exactly as the path module does`, () => {
      expect(joinPath({ platform: "linux", segments: row })).toBe(
        path.posix.join(...row),
      );
    });

    it(`spells ${row.join(" + ")} identically on darwin and linux`, () => {
      expect(joinPath({ platform: "darwin", segments: row })).toBe(
        joinPath({ platform: "linux", segments: row }),
      );
    });
  }
});
