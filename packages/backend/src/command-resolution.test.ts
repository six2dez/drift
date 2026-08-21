import { mkdtemp, mkdir, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCommandCandidatePaths,
  collectVersionManagerCommandCandidates,
  extractHomeDir,
  formatProviderUnavailableMessage,
  getCommandExecutableCandidates,
  getNodeExecutableCandidates,
  getProviderInstallHint,
} from "./command-resolution";

describe("command resolution helpers", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("extracts home directories from macOS and Linux-style paths", () => {
    expect(extractHomeDir("/Users/six2dez/.local/bin/claude")).toBe("/Users/six2dez");
    expect(extractHomeDir("/home/test/.volta/bin/codex")).toBe("/home/test");
    expect(extractHomeDir("/Users/../../../tmp/claude")).toBeUndefined();
    expect(extractHomeDir("claude")).toBeUndefined();
  });

  it("collects version manager command candidates", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "drift-home-"));
    tempDirs.push(homeDir);
    await mkdir(path.join(homeDir, ".nvm", "versions", "node", "v22.1.0", "bin"), { recursive: true });
    await mkdir(path.join(homeDir, ".fnm", "node-versions", "v20.5.0", "installation", "bin"), {
      recursive: true,
    });

    const candidates = await collectVersionManagerCommandCandidates({
      homeDir,
      command: "claude",
      platform: "linux",
    });

    expect(candidates).toContain(
      path.join(homeDir, ".nvm", "versions", "node", "v22.1.0", "bin", "claude"),
    );
    expect(candidates).toContain(
      path.join(homeDir, ".fnm", "node-versions", "v20.5.0", "installation", "bin", "claude"),
    );
  });

  it("builds command candidates from PATH and common install locations", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "drift-home-"));
    tempDirs.push(homeDir);
    await mkdir(path.join(homeDir, ".nvm", "versions", "node", "v18.0.0", "bin"), { recursive: true });

    const candidates = await getCommandExecutableCandidates({
      command: "claude",
      platform: "linux",
      pathResolution: "/opt/homebrew/bin/claude",
      homeDirs: [homeDir],
      roots: {},
    });

    expect(candidates[0]).toBe("/opt/homebrew/bin/claude");
    expect(candidates).toContain(path.join(homeDir, ".local", "bin", "claude"));
    expect(candidates).toContain(path.join(homeDir, ".volta", "bin", "claude"));
    expect(candidates).toContain(path.join(homeDir, ".asdf", "shims", "claude"));
    expect(candidates).toContain(path.join(homeDir, "Library", "pnpm", "claude"));
    expect(candidates).toContain(
      path.join(homeDir, ".nvm", "versions", "node", "v18.0.0", "bin", "claude"),
    );
  });

  it("returns an actionable install hint for every known provider", () => {
    expect(getProviderInstallHint("claude-cli")).toContain("claude.ai/install.sh");
    expect(getProviderInstallHint("gemini-cli")).toContain("@google/gemini-cli");
    expect(getProviderInstallHint("codex-cli")).toContain("@openai/codex");
    expect(getProviderInstallHint("copilot-cli")).toContain("gh extension install");
  });

  it("returns a generic hint for unknown providers", () => {
    const hint = getProviderInstallHint("unknown-cli");
    expect(hint).toContain("Install the CLI");
    expect(hint).toContain("Settings");
  });

  it("appends the install hint to the cause in formatProviderUnavailableMessage", () => {
    const message = formatProviderUnavailableMessage(
      "claude-cli",
      "CLI not found: claude",
    );
    expect(message.startsWith("CLI not found: claude")).toBe(true);
    expect(message).toContain("claude.ai/install.sh");
  });

  it("builds node candidates from known homes and provider-adjacent paths", async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), "drift-home-"));
    tempDirs.push(homeDir);

    // The provider directory is a SECOND temp dir, deliberately not homeDir.
    // getNodeExecutableCandidates already emits `<homeDir>/.local/bin/node`
    // from its homeDirs loop, so asserting a provider-adjacent path underneath
    // homeDir would still pass with the absoluteProviderCommands loop deleted.
    // A separate root is what keeps this assertion falsifiable.
    //
    // It is built with path.join rather than written as a "/Users/..." literal
    // because getNodeExecutableCandidates derives the sibling with
    // path.join(path.dirname(cmd), "node") — host-flavoured by design, and
    // correct on a real Windows host where the command is "C:\...\claude.cmd".
    // The POSIX literal this replaced could only ever hold when `path` was
    // POSIX, so it failed the first real windows-latest run (CI run
    // 32376894371, 2026-08-20) for the test's reasons, not the code's:
    //   expected [ '/usr/local/bin/node', …(6) ] to include '/Users/six2dez/.local/bin/node'
    const providerDir = await mkdtemp(path.join(os.tmpdir(), "drift-provider-"));
    tempDirs.push(providerDir);

    const candidates = await getNodeExecutableCandidates({
      execPath: "/usr/local/bin/node",
      pathResolution: "/opt/homebrew/bin/node",
      homeDirs: [homeDir],
      absoluteProviderCommands: [path.join(providerDir, "claude")],
    });

    expect(candidates).toContain("/usr/local/bin/node");
    expect(candidates).toContain("/opt/homebrew/bin/node");
    expect(candidates).toContain(path.join(providerDir, "node"));
    expect(candidates).toContain(path.join(homeDir, ".volta", "bin", "node"));
  });
});

// The SC-5 argument in miniature: a Windows install location asserted from
// LITERAL roots on the Linux CI runner, with no directory created. The whole
// point of D-10's pure/impure split is that C:\Users\six\AppData\Roaming\npm
// cannot exist here, so the only way this list can be proven is by keeping the
// builder free of filesystem calls.
// The six named roots as a real Windows environment would supply them. Shared by
// every win32 block below so a root spelling cannot drift between assertions.
const WIN32_ROOTS = {
  userProfile: "C:\\Users\\six",
  appData: "C:\\Users\\six\\AppData\\Roaming",
  localAppData: "C:\\Users\\six\\AppData\\Local",
  programFiles: "C:\\Program Files",
  programFilesX86: "C:\\Program Files (x86)",
  programData: "C:\\ProgramData",
};

describe("buildCommandCandidatePaths (win32 named roots)", () => {
  it("emits the %APPDATA%\\npm ladder in .exe, .cmd, .bat order", () => {
    expect(
      buildCommandCandidatePaths({
        platform: "win32",
        command: "claude",
        pathResolution: undefined,
        homeDirs: [],
        roots: { appData: "C:\\Users\\six\\AppData\\Roaming" },
        versionCandidatesByHomeDir: {},
      }),
    ).toEqual([
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.exe",
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.cmd",
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.bat",
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude",
      // The one row that depends on no environment variable at all: the
      // nvm-windows installer's own symlink default (catalogue row P-06).
      "C:\\nvm4w\\nodejs\\claude.exe",
      "C:\\nvm4w\\nodejs\\claude.cmd",
      "C:\\nvm4w\\nodejs\\claude.bat",
      "C:\\nvm4w\\nodejs\\claude",
    ]);
  });

  // The whole sourced table, asserted as ONE ordered array rather than with
  // toContain. toContain cannot detect a reordering, and D-11's location-major
  // ordering IS the claim: all four spellings of one location before any
  // spelling of the next. Read the expected array's shape, not just its length —
  // four consecutive entries share a directory prefix, then the prefix changes.
  it("emits every KEEP row of the research catalogue, location-major", () => {
    expect(
      buildCommandCandidatePaths({
        platform: "win32",
        command: "claude",
        pathResolution: undefined,
        homeDirs: [],
        roots: WIN32_ROOTS,
        versionCandidatesByHomeDir: {},
      }),
    ).toEqual([
      // P-01 npm global prefix — no `bin` segment on Windows.
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.exe",
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.cmd",
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.bat",
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude",
      // P-19 Claude Code native installer / user bin.
      "C:\\Users\\six\\.local\\bin\\claude.exe",
      "C:\\Users\\six\\.local\\bin\\claude.cmd",
      "C:\\Users\\six\\.local\\bin\\claude.bat",
      "C:\\Users\\six\\.local\\bin\\claude",
      // P-11 / P-12 Volta shims — under LOCAL application data, not ~/.volta.
      "C:\\Users\\six\\AppData\\Local\\Volta\\bin\\claude.exe",
      "C:\\Users\\six\\AppData\\Local\\Volta\\bin\\claude.cmd",
      "C:\\Users\\six\\AppData\\Local\\Volta\\bin\\claude.bat",
      "C:\\Users\\six\\AppData\\Local\\Volta\\bin\\claude",
      // P-16 pnpm data dir.
      "C:\\Users\\six\\AppData\\Local\\pnpm\\claude.exe",
      "C:\\Users\\six\\AppData\\Local\\pnpm\\claude.cmd",
      "C:\\Users\\six\\AppData\\Local\\pnpm\\claude.bat",
      "C:\\Users\\six\\AppData\\Local\\pnpm\\claude",
      // P-16 pnpm's own no-LOCALAPPDATA fallback arm.
      "C:\\Users\\six\\.pnpm\\claude.exe",
      "C:\\Users\\six\\.pnpm\\claude.cmd",
      "C:\\Users\\six\\.pnpm\\claude.bat",
      "C:\\Users\\six\\.pnpm\\claude",
      // P-15 Bun.
      "C:\\Users\\six\\.bun\\bin\\claude.exe",
      "C:\\Users\\six\\.bun\\bin\\claude.cmd",
      "C:\\Users\\six\\.bun\\bin\\claude.bat",
      "C:\\Users\\six\\.bun\\bin\\claude",
      // P-17 scoop, per-user.
      "C:\\Users\\six\\scoop\\shims\\claude.exe",
      "C:\\Users\\six\\scoop\\shims\\claude.cmd",
      "C:\\Users\\six\\scoop\\shims\\claude.bat",
      "C:\\Users\\six\\scoop\\shims\\claude",
      // P-18 scoop, machine-wide.
      "C:\\ProgramData\\scoop\\shims\\claude.exe",
      "C:\\ProgramData\\scoop\\shims\\claude.cmd",
      "C:\\ProgramData\\scoop\\shims\\claude.bat",
      "C:\\ProgramData\\scoop\\shims\\claude",
      // P-06 nvm-windows symlink default.
      "C:\\nvm4w\\nodejs\\claude.exe",
      "C:\\nvm4w\\nodejs\\claude.cmd",
      "C:\\nvm4w\\nodejs\\claude.bat",
      "C:\\nvm4w\\nodejs\\claude",
    ]);
  });

  it("emits 9 locations x 4 ladder spellings when every root is populated", () => {
    expect(
      buildCommandCandidatePaths({
        platform: "win32",
        command: "claude",
        pathResolution: undefined,
        homeDirs: [],
        roots: WIN32_ROOTS,
        versionCandidatesByHomeDir: {},
      }),
    ).toHaveLength(36);
  });

  it("emits only the rootless nvm-windows symlink row when no named root is set", () => {
    // The 06-01 shape of this test asserted an empty array. That was correct
    // when %APPDATA%\npm was the only row: every row then depended on an env
    // variable. The sourced catalogue adds exactly one row that depends on NO
    // variable — the nvm-windows installer's own symlink default — so the
    // no-roots answer is that row's ladder and nothing else. Every OTHER row
    // still vanishes with its root, which is the T-06-T02 mitigation and is what
    // the surrounding assertions pin.
    expect(
      buildCommandCandidatePaths({
        platform: "win32",
        command: "claude",
        pathResolution: undefined,
        homeDirs: [],
        roots: {},
        versionCandidatesByHomeDir: {},
      }),
    ).toEqual([
      "C:\\nvm4w\\nodejs\\claude.exe",
      "C:\\nvm4w\\nodejs\\claude.cmd",
      "C:\\nvm4w\\nodejs\\claude.bat",
      "C:\\nvm4w\\nodejs\\claude",
    ]);
  });

  it("emits one entry per location for a command that already carries an extension", () => {
    expect(
      buildCommandCandidatePaths({
        platform: "win32",
        command: "claude.CMD",
        pathResolution: undefined,
        homeDirs: [],
        roots: WIN32_ROOTS,
        versionCandidatesByHomeDir: {},
      }),
    ).toEqual([
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.CMD",
      "C:\\Users\\six\\.local\\bin\\claude.CMD",
      "C:\\Users\\six\\AppData\\Local\\Volta\\bin\\claude.CMD",
      "C:\\Users\\six\\AppData\\Local\\pnpm\\claude.CMD",
      "C:\\Users\\six\\.pnpm\\claude.CMD",
      "C:\\Users\\six\\.bun\\bin\\claude.CMD",
      "C:\\Users\\six\\scoop\\shims\\claude.CMD",
      "C:\\ProgramData\\scoop\\shims\\claude.CMD",
      "C:\\nvm4w\\nodejs\\claude.CMD",
    ]);
  });
});

// The win32 version-manager rows, asserted from LITERAL discovered names. The
// names would come from a readdir on a real machine; feeding them as data is
// what makes the SPELLING — which is the part that is easy to get wrong and
// impossible to notice — provable on a Linux runner with no directory created.
describe("buildCommandCandidatePaths (win32 version-manager walk)", () => {
  const versionInput = {
    platform: "win32" as const,
    command: "claude",
    pathResolution: undefined,
    homeDirs: [],
    roots: WIN32_ROOTS,
    versionCandidatesByHomeDir: {},
  };

  it("spells the nvm-windows version row with no bin segment and a v-prefixed directory", () => {
    const candidates = buildCommandCandidatePaths({
      ...versionInput,
      windowsVersionDirs: {
        nvmWindows: ["v22.1.0"],
        fnmModern: [],
        fnmLegacy: [],
        voltaNodeImages: [],
      },
    });

    expect(candidates).toContain(
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.1.0\\claude.exe",
    );
    // The `v` prefix is part of the directory name the installer creates, and
    // node.exe sits DIRECTLY in it — the POSIX ~/.nvm layout's `bin` segment
    // does not exist here.
    expect(
      candidates.filter((candidate) => candidate.includes("\\nvm\\")),
    ).toEqual([
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.1.0\\claude.exe",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.1.0\\claude.cmd",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.1.0\\claude.bat",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.1.0\\claude",
    ]);
    for (const candidate of candidates) {
      expect(candidate.includes("\\nvm\\v22.1.0\\bin\\")).toBe(false);
    }
  });

  // The asymmetry most likely to be "tidied up" by a later reader, so it is
  // asserted from both sides in one test: fnm appends `bin` only on non-Windows
  // (cfg(not(windows)) in src/commands/exec.rs), so the win32 row ends at
  // installation and the POSIX row does not.
  it("drops fnm's bin segment on win32 while the POSIX fnm row keeps it", () => {
    const win32Candidates = buildCommandCandidatePaths({
      ...versionInput,
      windowsVersionDirs: {
        nvmWindows: [],
        fnmModern: ["v20.5.0"],
        fnmLegacy: ["v18.0.0"],
        voltaNodeImages: [],
      },
    });

    expect(win32Candidates).toContain(
      "C:\\Users\\six\\AppData\\Roaming\\fnm\\node-versions\\v20.5.0\\installation\\claude.exe",
    );
    expect(win32Candidates).toContain(
      "C:\\Users\\six\\.fnm\\node-versions\\v18.0.0\\installation\\claude.exe",
    );
    for (const candidate of win32Candidates) {
      expect(candidate.includes("installation\\bin")).toBe(false);
    }

    const posixCandidates = buildCommandCandidatePaths({
      platform: "linux",
      command: "claude",
      pathResolution: undefined,
      homeDirs: ["/home/six"],
      roots: {},
      versionCandidatesByHomeDir: {
        "/home/six": [
          "/home/six/.fnm/node-versions/v20.5.0/installation/bin/claude",
        ],
      },
    });
    expect(posixCandidates).toContain(
      "/home/six/.fnm/node-versions/v20.5.0/installation/bin/claude",
    );
  });

  it("emits only the newest three version directories per root on win32", () => {
    const candidates = buildCommandCandidatePaths({
      ...versionInput,
      windowsVersionDirs: {
        nvmWindows: ["v24.0.0", "v23.0.0", "v22.0.0", "v21.0.0", "v20.0.0"],
        fnmModern: [],
        fnmLegacy: [],
        voltaNodeImages: [],
      },
    });

    const nvmRows = candidates.filter((candidate) =>
      candidate.includes("\\nvm\\v"),
    );
    // Three locations' worth of ladder, not five.
    expect(nvmRows).toHaveLength(12);
    expect(nvmRows).toEqual([
      "C:\\Users\\six\\AppData\\Local\\nvm\\v24.0.0\\claude.exe",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v24.0.0\\claude.cmd",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v24.0.0\\claude.bat",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v24.0.0\\claude",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v23.0.0\\claude.exe",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v23.0.0\\claude.cmd",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v23.0.0\\claude.bat",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v23.0.0\\claude",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.0.0\\claude.exe",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.0.0\\claude.cmd",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.0.0\\claude.bat",
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.0.0\\claude",
    ]);
  });

  // The bound is win32-only ON PURPOSE: applying it to POSIX would silently drop
  // version directories macOS and Linux users resolve today, which is exactly the
  // CMP-01 regression this phase must not ship.
  it("does not truncate the POSIX version list", () => {
    const posixVersions = [
      "/home/six/.nvm/versions/node/v24.0.0/bin/claude",
      "/home/six/.nvm/versions/node/v23.0.0/bin/claude",
      "/home/six/.nvm/versions/node/v22.0.0/bin/claude",
      "/home/six/.nvm/versions/node/v21.0.0/bin/claude",
      "/home/six/.nvm/versions/node/v20.0.0/bin/claude",
    ];
    const candidates = buildCommandCandidatePaths({
      platform: "linux",
      command: "claude",
      pathResolution: undefined,
      homeDirs: ["/home/six"],
      roots: {},
      versionCandidatesByHomeDir: { "/home/six": posixVersions },
    });

    expect(
      candidates.filter((candidate) => candidate.includes("/.nvm/")),
    ).toEqual(posixVersions);
  });

  it("emits the version rows after the fixed locations and before the rootless literal", () => {
    const candidates = buildCommandCandidatePaths({
      ...versionInput,
      windowsVersionDirs: {
        nvmWindows: ["v22.1.0"],
        fnmModern: [],
        fnmLegacy: [],
        voltaNodeImages: [],
      },
    });

    const scoopGlobal = candidates.indexOf(
      "C:\\ProgramData\\scoop\\shims\\claude.exe",
    );
    const nvmVersion = candidates.indexOf(
      "C:\\Users\\six\\AppData\\Local\\nvm\\v22.1.0\\claude.exe",
    );
    const literal = candidates.indexOf("C:\\nvm4w\\nodejs\\claude.exe");
    expect(scoopGlobal).toBeGreaterThanOrEqual(0);
    expect(nvmVersion).toBeGreaterThan(scoopGlobal);
    expect(literal).toBeGreaterThan(nvmVersion);
  });
});

// CMP-01 — the D-10 split reproduces the pre-split candidate ORDER exactly.
//
// 06-CONTEXT records the D-10 split as `costly` precisely because this evidence
// is what would have to be rebuilt if the split were undone. This block IS that
// evidence, so it asserts the WHOLE ordered array with toEqual and never with
// toContain: toContain cannot detect a reordering, and reordering the candidate
// list changes which binary a user actually gets when two of them exist.
//
// The expected values are POSIX string LITERALS, not path-module calls. That is
// the opposite of the licensed host-flavoured comparison at :97-110 above, and
// deliberately so: that test asserts a HOST-flavoured helper (the
// path.dirname sibling walk), so its expectation must be built host-flavoured or
// it fails on a real windows-latest run — which it did, on CI run 32376894371.
// This block asserts a PLATFORM-INJECTED helper, so a host-flavoured expectation
// would turn it back into a test of the runner, which is exactly what D-05 and
// D-10 exist to eliminate.
const CMP_01_POSIX_CANDIDATES = [
  "/opt/homebrew/bin/claude",
  "/usr/local/bin/claude",
  "/usr/bin/claude",
  "/bin/claude",
  "/home/six/.local/bin/claude",
  "/home/six/.volta/bin/claude",
  "/home/six/.asdf/shims/claude",
  "/home/six/.npm-global/bin/claude",
  "/home/six/.bun/bin/claude",
  "/home/six/Library/pnpm/claude",
  "/home/six/.local/share/pnpm/claude",
  "/home/six/.nvm/versions/node/v22.1.0/bin/claude",
];

const cmp01PosixInput = {
  command: "claude",
  // The pathResolution is also the first absolute row, so its absence from the
  // list twice is pushUniqueCandidate's dedup asserted in passing.
  pathResolution: "/opt/homebrew/bin/claude",
  homeDirs: ["/home/six"],
  versionCandidatesByHomeDir: {
    "/home/six": ["/home/six/.nvm/versions/node/v22.1.0/bin/claude"],
  },
};

describe("buildCommandCandidatePaths CMP-01 POSIX order", () => {
  it("reproduces the pre-split candidate list on linux", () => {
    expect(
      buildCommandCandidatePaths({
        ...cmp01PosixInput,
        platform: "linux",
        roots: {},
      }),
    ).toEqual(CMP_01_POSIX_CANDIDATES);
  });

  it("reproduces the pre-split candidate list on darwin", () => {
    expect(
      buildCommandCandidatePaths({
        ...cmp01PosixInput,
        platform: "darwin",
        roots: {},
      }),
    ).toEqual(CMP_01_POSIX_CANDIDATES);
  });

  it("reproduces the pre-split candidate list before the platform probe has run", () => {
    // The pre-probe POSIX case CMP-01 protects: on a machine where no Windows
    // root variable is set, the union arm emits every win32 row as nothing, so
    // the list is byte-identical to today's.
    expect(
      buildCommandCandidatePaths({
        ...cmp01PosixInput,
        platform: undefined,
        roots: {},
      }),
    ).toEqual(CMP_01_POSIX_CANDIDATES);
  });

  it("appends the win32 rows after the POSIX rows rather than interleaving them", () => {
    expect(
      buildCommandCandidatePaths({
        ...cmp01PosixInput,
        platform: undefined,
        roots: { appData: "C:\\Users\\six\\AppData\\Roaming" },
      }),
    ).toEqual([
      ...CMP_01_POSIX_CANDIDATES,
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.exe",
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.cmd",
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude.bat",
      "C:\\Users\\six\\AppData\\Roaming\\npm\\claude",
    ]);
  });

  it("emits no duplicate candidate for a home directory listed twice", () => {
    expect(
      buildCommandCandidatePaths({
        ...cmp01PosixInput,
        platform: "linux",
        homeDirs: ["/home/six", "/home/six"],
        roots: {},
      }),
    ).toEqual(CMP_01_POSIX_CANDIDATES);
  });
});
