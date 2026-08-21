import { mkdtemp, mkdir, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CliProvider } from "shared";
import {
  buildCommandCandidatePaths,
  buildNodeCandidatePaths,
  collectVersionManagerCommandCandidates,
  extractHomeDir,
  foldCandidateKey,
  formatProviderUnavailableMessage,
  getCommandExecutableCandidates,
  getNodeExecutableCandidates,
  getProviderInstallHint,
  pushUniqueCandidate,
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

  // RES-03 / D-06. extractHomeDir is PLATFORM-BLIND — one string in, no injected
  // platform — so every expectation here is a LITERAL. Building one with the
  // host's `path` would make this a test of the runner rather than of the
  // function: on the Linux runner `path.join("C:\\Users", "six")` yields
  // "C:\\Users/six", which is neither spelling the function is asked about.
  it("extracts home directories from Windows profile paths in both spellings", () => {
    expect(extractHomeDir("C:\\Users\\six\\.local\\bin\\claude.exe")).toBe(
      "C:\\Users\\six",
    );
    expect(extractHomeDir("C:/Users/six/.local/bin/claude")).toBe(
      "C:/Users/six",
    );
    expect(extractHomeDir("c:\\users\\six\\AppData\\Roaming")).toBe(
      "c:\\users\\six",
    );
    expect(extractHomeDir("D:\\Users\\six\\.bun\\bin\\claude.cmd")).toBe(
      "D:\\Users\\six",
    );
    expect(extractHomeDir("C:\\Users\\six")).toBe("C:\\Users\\six");
  });

  it("declines the Windows path shapes it deliberately does not recognise", () => {
    // No user segment under the profile root.
    expect(extractHomeDir("C:\\Users")).toBeUndefined();
    // Not a profile path at all.
    expect(
      extractHomeDir("C:\\Program Files\\nodejs\\node.exe"),
    ).toBeUndefined();
    // Traversal: rejected outright rather than collapsed, so no home directory
    // outside the profile tree can ever be inferred (T-06-T14).
    expect(
      extractHomeDir("C:\\Users\\..\\..\\Windows\\system32"),
    ).toBeUndefined();
    // UNC: the recorded non-claim (T-06-T15). A network share has no
    // C:\Users\<name> analogue and inventing one would seed every candidate row
    // from a remote root.
    expect(extractHomeDir("\\\\server\\share\\home\\six")).toBeUndefined();
    // A bare drive is drive-RELATIVE; a drive root has no user segment.
    expect(extractHomeDir("C:")).toBeUndefined();
    expect(extractHomeDir("C:\\")).toBeUndefined();
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

    // The DIRECTORIES above are created with the host-flavoured path.join,
    // which is correct: they are real directories on the real filesystem. The
    // EXPECTATIONS are written with the injected platform's separator, because
    // since plan 06-01 the helper spells its output through joinPath for the
    // TARGET platform ("linux" here) rather than through the host's `path`.
    // Comparing a platform-injected result against a host-flavoured join is what
    // took the `windows-latest` leg red (WINDOWS.md entry 6); the two forms are
    // byte-identical on a POSIX host and only these agree on a Windows one.
    expect(candidates).toContain(
      `${homeDir}/.nvm/versions/node/v22.1.0/bin/claude`,
    );
    expect(candidates).toContain(
      `${homeDir}/.fnm/node-versions/v20.5.0/installation/bin/claude`,
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

    // Platform-injected expectations, for the reason spelled out in the version
    // manager test above.
    expect(candidates[0]).toBe("/opt/homebrew/bin/claude");
    expect(candidates).toContain(`${homeDir}/.local/bin/claude`);
    expect(candidates).toContain(`${homeDir}/.volta/bin/claude`);
    expect(candidates).toContain(`${homeDir}/.asdf/shims/claude`);
    expect(candidates).toContain(`${homeDir}/Library/pnpm/claude`);
    expect(candidates).toContain(
      `${homeDir}/.nvm/versions/node/v18.0.0/bin/claude`,
    );
  });

  // The half of every hint that tells a user what to do when installing is not
  // the answer. Preserved character for character across the move to the shared
  // table, so it is spelled once here and reused by the byte-identity checks.
  const SETTINGS_SUFFIX =
    ", or set the absolute binary path in Settings → CLI Providers.";

  it("reproduces the macOS/Linux install hint shipping today, byte for byte", () => {
    // CMP-01, made mechanical. D-13 claims the macOS/Linux arm is byte-identical
    // "by inspection"; equality assertions on the FULL sentence are that claim
    // turned into a test. A toContain() check would pass even if the renderer
    // silently reworded the product label or dropped the settings suffix.
    expect(
      getProviderInstallHint({ providerId: "claude-cli", platform: "linux" }),
    ).toBe(
      "Install Claude Code with `curl -fsSL https://claude.ai/install.sh | bash`" +
        SETTINGS_SUFFIX,
    );
    expect(
      getProviderInstallHint({ providerId: "gemini-cli", platform: "darwin" }),
    ).toBe(
      "Install Gemini CLI with `npm install -g @google/gemini-cli`" +
        SETTINGS_SUFFIX,
    );
    expect(
      getProviderInstallHint({ providerId: "codex-cli", platform: "linux" }),
    ).toBe(
      "Install Codex CLI with `npm install -g @openai/codex`" + SETTINGS_SUFFIX,
    );
  });

  // D-14. THIS ASSERTION WAS INVERTED DELIBERATELY. Until this commit it asserted
  // that the Copilot hint CONTAINED the deprecated `gh`-extension install command
  // for `github/gh-copilot`; it now asserts the opposite. That command installs a
  // `gh` CLI extension whose upstream repository was deprecated on 2025-10-25 and
  // archived read-only on 2025-10-30, so the string Drift shipped pointed every
  // user at a dead repository. The correction ships on EVERY platform, not only
  // Windows, because UX-02's own wording is "replacing" — leaving the wrong
  // command on macOS and Linux while fixing Windows would be a deliberate defect
  // against the entire current user base. This is a COPY fix, not a behaviour
  // change: CMP-01 protects macOS/Linux BEHAVIOUR, and a corrected error string
  // is not a POSIX regression. A verifier meeting a flipped assertion finds the
  // reason here rather than in a planning document.
  //
  // The deprecated command is asserted against by its two distinctive fragments
  // rather than spelled out in full, deliberately: plan 06-07 runs a
  // REPOSITORY-WIDE absence check for the full phrase once HelpView.vue is
  // fixed, and CHANGELOG.md — a historical record of what 0.1.0 shipped, which
  // must not be retro-edited — is that check's sole expected surviving hit.
  // Spelling the phrase out here would make this guard the thing that breaks it.
  // The two fragments together are a STRICTLY STRONGER guard than the full
  // phrase, not a weaker one.
  it("names the current Copilot package, not the archived extension, on every platform", () => {
    for (const platform of ["linux", "darwin", "win32", undefined] as const) {
      const hint = getProviderInstallHint({
        providerId: "copilot-cli",
        platform,
      });
      expect(hint).toContain("npm install -g @github/copilot");
      expect(hint).not.toContain("gh extension");
      expect(hint).not.toContain("gh-copilot");
    }
  });

  it("returns the Windows install route on win32", () => {
    const hint = getProviderInstallHint({
      providerId: "claude-cli",
      platform: "win32",
    });
    expect(hint).toContain("irm https://claude.ai/install.ps1 | iex");
    // The macOS/Linux shell script must not appear on the Windows arm.
    expect(hint).not.toContain("claude.ai/install.sh");
    expect(hint.endsWith(SETTINGS_SUFFIX)).toBe(true);
  });

  it("names BOTH routes when the platform is unknown and the arms differ", () => {
    // The fourth application of the union-when-unknown rule (isAbsolutePath,
    // getHomeDirCandidates, extractHomeDir, and now the hint renderer): a
    // pre-probe `undefined` platform is answered with every spelling rather than
    // by guessing one.
    const hint = getProviderInstallHint({
      providerId: "claude-cli",
      platform: undefined,
    });
    expect(hint).toContain("curl -fsSL https://claude.ai/install.sh | bash");
    expect(hint).toContain("irm https://claude.ai/install.ps1 | iex");
    expect(hint).toContain("macOS or Linux");
    expect(hint).toContain("Windows");
    expect(hint.endsWith(SETTINGS_SUFFIX)).toBe(true);
  });

  it("names ONE command when the platform is unknown and the arms are equal", () => {
    // Three of the four providers install identically on both platforms, so
    // duplicating the command under two platform labels would be noise.
    const hint = getProviderInstallHint({
      providerId: "gemini-cli",
      platform: undefined,
    });
    expect(hint).toBe(
      "Install Gemini CLI with `npm install -g @google/gemini-cli`" +
        SETTINGS_SUFFIX,
    );
  });

  it("returns a non-empty hint for every provider on every platform arm", () => {
    for (const providerId of Object.values(CliProvider)) {
      for (const platform of ["linux", "darwin", "win32", undefined] as const) {
        const hint = getProviderInstallHint({ providerId, platform });
        expect(hint.length).toBeGreaterThan(0);
        expect(hint.endsWith(SETTINGS_SUFFIX)).toBe(true);
      }
    }
  });

  it("returns a generic hint for unknown providers", () => {
    // The provider id stays a loose string on the way in because callers hold
    // configuration keys rather than union members; this fallback is what makes
    // that safe, so it is asserted on a defined platform and an unknown one.
    for (const platform of ["linux", "win32", undefined] as const) {
      const hint = getProviderInstallHint({
        providerId: "unknown-cli",
        platform,
      });
      expect(hint).toContain("Install the CLI");
      expect(hint).toContain("Settings");
    }
  });

  it("appends the install hint to the cause in formatProviderUnavailableMessage", () => {
    const message = formatProviderUnavailableMessage({
      providerId: "claude-cli",
      cause: "CLI not found: claude",
      platform: "linux",
    });
    expect(message.startsWith("CLI not found: claude")).toBe(true);
    expect(message).toContain("claude.ai/install.sh");
    // The separator is unchanged: cause, full stop, space, hint.
    expect(message).toBe(
      "CLI not found: claude. " +
        getProviderInstallHint({ providerId: "claude-cli", platform: "linux" }),
    );
  });

  it("threads the platform through formatProviderUnavailableMessage", () => {
    const message = formatProviderUnavailableMessage({
      providerId: "claude-cli",
      cause: "CLI not found: claude",
      platform: "win32",
    });
    expect(message).toContain("install.ps1");
    expect(message).not.toContain("install.sh");
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
    //
    // UPDATE (plan 06-02, T-06-06) — the comment above is preserved verbatim
    // because its argument still holds for the INPUT: `providerDir` is a host
    // path and the sibling directory is still derived with the host-flavoured
    // `path.dirname`. What changed is the JOIN. The sibling is now spelled by
    // the platform-injected `joinPath` for the platform passed in below, so the
    // two expectations are written with the injected platform's separator
    // instead of the host's. Before this task they were host-flavoured joins
    // against a POSIX-spelled result, which is why the `windows-latest` leg was
    // red between plans 06-01 and 06-02 (WINDOWS.md entry 6). Both forms below
    // are byte-identical on a POSIX host and now also correct on a Windows one.
    const providerDir = await mkdtemp(path.join(os.tmpdir(), "drift-provider-"));
    tempDirs.push(providerDir);

    const candidates = await getNodeExecutableCandidates({
      platform: "linux",
      execPath: "/usr/local/bin/node",
      pathResolution: "/opt/homebrew/bin/node",
      homeDirs: [homeDir],
      roots: {},
      absoluteProviderCommands: [path.join(providerDir, "claude")],
    });

    expect(candidates).toContain("/usr/local/bin/node");
    expect(candidates).toContain("/opt/homebrew/bin/node");
    expect(candidates).toContain(`${providerDir}/node`);
    expect(candidates).toContain(`${homeDir}/.volta/bin/node`);
  });
});

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

// The SC-5 argument in miniature: a Windows install location asserted from
// LITERAL roots on the Linux CI runner, with no directory created. The whole
// point of D-10's pure/impure split is that C:\Users\six\AppData\Roaming\npm
// cannot exist here, so the only way this list can be proven is by keeping the
// builder free of filesystem calls.
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

// ── buildNodeCandidatePaths ────────────────────────────────────────────────
//
// Node resolution gets its own builder because its candidate list is genuinely
// different from a provider CLI's: an exec path and a provider-adjacent sibling
// at the front, and on Windows two node-only rows (the MSI directory and the
// Volta node IMAGE) that no provider CLI ever lives in.
describe("buildNodeCandidatePaths (win32)", () => {
  it("emits the node-only rows in order, with an absent root emitting nothing", () => {
    expect(
      buildNodeCandidatePaths({
        platform: "win32",
        execPath: undefined,
        pathResolution: undefined,
        homeDirs: [],
        roots: {
          programFiles: "C:\\Program Files",
          programFilesX86: "C:\\Program Files (x86)",
        },
        providerAdjacentDirs: ["C:\\Users\\six\\.local\\bin"],
        versionCandidatesByHomeDir: {},
      }),
    ).toEqual([
      // The provider-adjacent sibling gains the full ladder on win32: a bare
      // `node` beside a `claude.cmd` is not a Windows executable name.
      "C:\\Users\\six\\.local\\bin\\node.exe",
      "C:\\Users\\six\\.local\\bin\\node.cmd",
      "C:\\Users\\six\\.local\\bin\\node.bat",
      "C:\\Users\\six\\.local\\bin\\node",
      // P-02, the Node MSI directory.
      "C:\\Program Files\\nodejs\\node.exe",
      "C:\\Program Files\\nodejs\\node.cmd",
      "C:\\Program Files\\nodejs\\node.bat",
      "C:\\Program Files\\nodejs\\node",
      // P-03, the x86 tree — kept as a WOW64 bitness arm, tagged an assumption.
      "C:\\Program Files (x86)\\nodejs\\node.exe",
      "C:\\Program Files (x86)\\nodejs\\node.cmd",
      "C:\\Program Files (x86)\\nodejs\\node.bat",
      "C:\\Program Files (x86)\\nodejs\\node",
      // P-06, the rootless nvm-windows symlink default.
      "C:\\nvm4w\\nodejs\\node.exe",
      "C:\\nvm4w\\nodejs\\node.cmd",
      "C:\\nvm4w\\nodejs\\node.bat",
      "C:\\nvm4w\\nodejs\\node",
    ]);
  });

  // Pitfall 3. A Volta-resolved `node` on Windows is a `.cmd` SHIM, and Phase 3
  // measured a direct spawn of that spelling throwing synchronously. Reaching
  // the real node.exe under tools\image first is a genuine reduction in Phase
  // 7's cmd.exe surface — so the ordering is the claim, and an index comparison
  // is the only assertion that can falsify it.
  it("emits the Volta node image before the Volta shim", () => {
    const candidates = buildNodeCandidatePaths({
      platform: "win32",
      execPath: undefined,
      pathResolution: undefined,
      homeDirs: [],
      roots: WIN32_ROOTS,
      providerAdjacentDirs: [],
      versionCandidatesByHomeDir: {},
      windowsVersionDirs: {
        nvmWindows: [],
        fnmModern: [],
        fnmLegacy: [],
        voltaNodeImages: ["22.1.0"],
      },
    });

    const image = candidates.indexOf(
      "C:\\Users\\six\\AppData\\Local\\Volta\\tools\\image\\node\\22.1.0\\node.exe",
    );
    const shim = candidates.indexOf(
      "C:\\Users\\six\\AppData\\Local\\Volta\\bin\\node.exe",
    );
    expect(image).toBeGreaterThanOrEqual(0);
    expect(shim).toBeGreaterThanOrEqual(0);
    expect(image).toBeLessThan(shim);
  });

  it("emits four sibling entries on win32 and one on POSIX", () => {
    const win32Siblings = buildNodeCandidatePaths({
      platform: "win32",
      execPath: undefined,
      pathResolution: undefined,
      homeDirs: [],
      roots: {},
      providerAdjacentDirs: ["C:\\Users\\six\\.local\\bin"],
      versionCandidatesByHomeDir: {},
    }).filter((candidate) => candidate.startsWith("C:\\Users\\six\\.local\\bin"));
    expect(win32Siblings).toHaveLength(4);

    const posixSiblings = buildNodeCandidatePaths({
      platform: "linux",
      execPath: undefined,
      pathResolution: undefined,
      homeDirs: [],
      roots: {},
      providerAdjacentDirs: ["/opt/providers/bin"],
      versionCandidatesByHomeDir: {},
    }).filter((candidate) => candidate.startsWith("/opt/providers/bin"));
    expect(posixSiblings).toEqual(["/opt/providers/bin/node"]);
  });

  it("emits no nodejs row at all when neither program-files variable is set", () => {
    const candidates = buildNodeCandidatePaths({
      platform: "win32",
      execPath: undefined,
      pathResolution: undefined,
      homeDirs: [],
      roots: {
        userProfile: "C:\\Users\\six",
        appData: "C:\\Users\\six\\AppData\\Roaming",
        localAppData: "C:\\Users\\six\\AppData\\Local",
        programData: "C:\\ProgramData",
      },
      providerAdjacentDirs: [],
      versionCandidatesByHomeDir: {},
    });

    expect(
      candidates.some((candidate) => candidate.includes("Program Files")),
    ).toBe(false);
    // Never an empty prefix: a candidate BEGINNING with the nodejs segment would
    // be a relative path resolving against the process working directory.
    for (const candidate of candidates) {
      expect(candidate.startsWith("nodejs")).toBe(false);
    }
  });
});

// CMP-01 for the node builder: the POSIX list and its ORDER are what a macOS or
// Linux user resolves today, asserted as a literal array so the Q4 relocation of
// the provider-adjacent derivation cannot quietly reorder them.
describe("buildNodeCandidatePaths CMP-01 POSIX order", () => {
  const NODE_CMP_01_POSIX = [
    "/usr/local/bin/node",
    "/opt/homebrew/bin/node",
    "/opt/providers/bin/node",
    "/usr/bin/node",
    "/home/six/.volta/bin/node",
    "/home/six/.asdf/shims/node",
    "/home/six/.local/bin/node",
    "/home/six/.nvm/versions/node/v22.1.0/bin/node",
  ];

  const posixInput = {
    execPath: "/usr/local/bin/node",
    pathResolution: "/opt/homebrew/bin/node",
    homeDirs: ["/home/six"],
    roots: {},
    providerAdjacentDirs: ["/opt/providers/bin"],
    versionCandidatesByHomeDir: {
      "/home/six": ["/home/six/.nvm/versions/node/v22.1.0/bin/node"],
    },
  };

  it("reproduces the pre-Phase-6 node candidate list on linux", () => {
    expect(
      buildNodeCandidatePaths({ ...posixInput, platform: "linux" }),
    ).toEqual(NODE_CMP_01_POSIX);
  });

  it("reproduces it on darwin", () => {
    expect(
      buildNodeCandidatePaths({ ...posixInput, platform: "darwin" }),
    ).toEqual(NODE_CMP_01_POSIX);
  });

  it("reproduces it before the platform probe has run", () => {
    expect(
      buildNodeCandidatePaths({ ...posixInput, platform: undefined }),
    ).toEqual(NODE_CMP_01_POSIX);
  });
});

// ── D-07: the pure win32 dedup fold ────────────────────────────────────────
//
// 04-D-04 expected this phase to wire runtime-probe.ts's normalizePathForCompare
// here. D-07 formally DECLINES; these tests are the evidence that the pure key
// is sufficient for the ONLY comparison this phase makes. The asymmetry between
// the two arms is the point: folding on win32 is safe because the filesystem is
// case-insensitive there, and folding anywhere else could DROP a real candidate.
describe("foldCandidateKey (D-07)", () => {
  it("collapses case and separator spelling into one key on win32", () => {
    expect(
      foldCandidateKey("C:\\Program Files\\nodejs\\node.exe", "win32"),
    ).toBe(foldCandidateKey("c:/program files/nodejs/node.exe", "win32"));
  });

  it("does not fold on a POSIX platform, where case names another file", () => {
    expect(foldCandidateKey("/Users/Six/bin/node", "linux")).not.toBe(
      foldCandidateKey("/users/six/bin/node", "linux"),
    );
    expect(foldCandidateKey("/Users/Six/bin/node", "linux")).toBe(
      "/Users/Six/bin/node",
    );
  });

  it("does not fold before the platform is known", () => {
    expect(foldCandidateKey("/Users/Six/bin/node", undefined)).toBe(
      "/Users/Six/bin/node",
    );
    expect(foldCandidateKey("C:\\Users\\Six", undefined)).toBe(
      "C:\\Users\\Six",
    );
  });
});

describe("pushUniqueCandidate dedup key (D-07)", () => {
  it("keeps the FIRST win32 spelling and drops the second", () => {
    const candidates: string[] = [];
    pushUniqueCandidate(
      candidates,
      "C:\\Program Files\\nodejs\\node.exe",
      "win32",
    );
    pushUniqueCandidate(candidates, "c:/program files/nodejs/node.exe", "win32");
    // ONE entry, and it is the original spelling of the first push — the fold is
    // a comparison key and never an emitted value.
    expect(candidates).toEqual(["C:\\Program Files\\nodejs\\node.exe"]);
  });

  it("keeps BOTH POSIX paths that differ only in case (CMP-01 guard)", () => {
    const candidates: string[] = [];
    pushUniqueCandidate(candidates, "/Users/Six/bin/node", "linux");
    pushUniqueCandidate(candidates, "/users/six/bin/node", "linux");
    expect(candidates).toEqual(["/Users/Six/bin/node", "/users/six/bin/node"]);
  });

  it("still trims and still skips empty values on every platform", () => {
    for (const platform of ["win32", "linux", "darwin", undefined] as const) {
      const candidates: string[] = [];
      pushUniqueCandidate(candidates, undefined, platform);
      pushUniqueCandidate(candidates, "", platform);
      pushUniqueCandidate(candidates, "   ", platform);
      expect(candidates).toEqual([]);
      pushUniqueCandidate(candidates, "  /usr/bin/node  ", platform);
      expect(candidates).toEqual(["/usr/bin/node"]);
    }
  });
});
