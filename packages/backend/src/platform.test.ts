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
    expect(getWhichCommand({ platform: "darwin" }).command).toBe("which");
    expect(getWhichCommand({ platform: "linux" }).command).toBe("which");
  });

  it("resolves with where.exe on win32", () => {
    expect(getWhichCommand({ platform: "win32" }).command).toBe("where.exe");
  });

  it("passes the command as a single argument on every platform", () => {
    expect(getWhichCommand({ platform: "darwin" }).args("node")).toEqual([
      "node",
    ]);
    expect(getWhichCommand({ platform: "linux" }).args("node")).toEqual([
      "node",
    ]);
    expect(getWhichCommand({ platform: "win32" }).args("node")).toEqual([
      "node",
    ]);
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
