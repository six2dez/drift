import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildSpawnEnv,
  getExecutableNames,
  getHomeDirCandidates,
  getSweepRoots,
  getTempRoot,
  getWhichCommand,
  getWindowsNamedRoots,
  isAbsolutePath,
  joinPath,
  normalizePlatform,
  rankPathSearchHits,
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

describe("getWhichCommand", () => {
  it("resolves with which on darwin and linux", () => {
    expect(getWhichCommand({ platform: "darwin", env: {} }).command).toBe(
      "which",
    );
    expect(getWhichCommand({ platform: "linux", env: {} }).command).toBe(
      "which",
    );
  });

  it("resolves with where.exe on win32", () => {
    expect(getWhichCommand({ platform: "win32", env: {} }).command).toBe(
      "where.exe",
    );
  });

  it("passes the command as a single argument on every platform", () => {
    expect(
      getWhichCommand({ platform: "darwin", env: {} }).args("node"),
    ).toEqual(["node"]);
    expect(
      getWhichCommand({ platform: "linux", env: {} }).args("node"),
    ).toEqual(["node"]);
    expect(
      getWhichCommand({ platform: "win32", env: {} }).args("node"),
    ).toEqual(["node"]);
  });

  it("invokes the search binary by absolute path under the machine's own system root", () => {
    // A NON-C drive on purpose: the root is READ from the environment, never
    // assumed. Phase 3 measured the C:\Windows spelling on the runner, and
    // hardcoding that literal was rejected — see the comment on the function.
    expect(
      getWhichCommand({ platform: "win32", env: { SystemRoot: "D:\\Windows" } })
        .command,
    ).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("honours the SCREAMING-case spelling, and prefers the native-cased key when both are present", () => {
    expect(
      getWhichCommand({ platform: "win32", env: { SYSTEMROOT: "E:\\Windows" } })
        .command,
    ).toBe("E:\\Windows\\System32\\where.exe");
    expect(
      getWhichCommand({
        platform: "win32",
        env: { SystemRoot: "D:\\Windows", SYSTEMROOT: "E:\\Elsewhere" },
      }).command,
    ).toBe("D:\\Windows\\System32\\where.exe");
  });

  it("falls back to the bare binary name when the variable is missing or blank", () => {
    // The fallback is load-bearing, not padding: the variable's presence rests
    // on libuv's back-fill list, which is Node's, and Caido's runtime is not
    // Node. This case is why the arm is not dead code.
    expect(getWhichCommand({ platform: "win32", env: {} }).command).toBe(
      "where.exe",
    );
    expect(
      getWhichCommand({ platform: "win32", env: { SystemRoot: "   " } })
        .command,
    ).toBe("where.exe");
    expect(
      getWhichCommand({ platform: "win32", env: { SystemRoot: undefined } })
        .command,
    ).toBe("where.exe");
  });

  it("does not double the separator for a root that already ends in one", () => {
    expect(
      getWhichCommand({
        platform: "win32",
        env: { SystemRoot: "D:\\Windows\\" },
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
      }).command,
    ).toBe("which");
    expect(
      getWhichCommand({ platform: undefined, env: {} }).args("node"),
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
// useless as an implementation and perfect as a comparison target on a POSIX
// runner, where its flavour is POSIX by construction. `grep -c 'from "path"'`
// over platform.ts itself still returns 0.
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
        path.join(...row),
      );
    });

    it(`spells ${row.join(" + ")} identically on darwin and linux`, () => {
      expect(joinPath({ platform: "darwin", segments: row })).toBe(
        joinPath({ platform: "linux", segments: row }),
      );
    });
  }
});
