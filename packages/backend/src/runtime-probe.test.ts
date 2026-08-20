import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  buildProbeReport,
  CAPABILITY_PURPOSE,
  formatProbeFailure,
  formatProbeReportFields,
  normalizePathForCompare,
  PROBE_CAPABILITIES,
  type ProbeCapabilityResult,
  type ProbeReport,
} from "./runtime-probe";

// These describe/it titles are a CONTRACT with 04-VALIDATION.md, which addresses
// this file's rows by `-t` substring, never by line number. Cited by requirement
// id and selector because that file is edited during the phase:
//   RUN-05  -t "unavailable"  — every version-block field renders, and a source
//                               that threw renders the literal `unavailable`
//   RUN-05  -t "gating"       — D-06's gate table classification
//   SC-10   -t "ladder"       — D-04's fall-through to path.resolve
// Renaming a title silently unhooks a requirement from its proof.
//
// Every fs rung is an injected fake. That injection is what lets a POSIX runner
// prove the ladder at all, and it is also honest about the target: under Caido
// rungs 1 and 2 do not exist (04-RESEARCH.md § LLRT Surface Risk), so the only
// rung that ever fires in production is the one the fall-through test pins.
//
// Assertions are explicit toContain / toEqual rather than vitest inline
// snapshots: there are no snapshot files anywhere in this repo, and introducing
// one would be a new pattern (04-PATTERNS.md).

type ProbeInput = Parameters<typeof buildProbeReport>[0];

function probeInput(overrides: Partial<ProbeInput> = {}): ProbeInput {
  return {
    rawPlatform: "linux",
    normalizedPlatform: "linux",
    tmpdir: "/tmp",
    tempRoot: "/tmp",
    realpathRung: "path.resolve",
    windowsEnvPresent: undefined,
    version: { driftVersion: "0.1.0" },
    ...overrides,
  };
}

function capabilityNamed(
  report: ProbeReport,
  name: string,
): ProbeCapabilityResult {
  const found = report.capabilities.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`capability "${name}" is missing from the report`);
  }
  return found;
}

describe("buildProbeReport", () => {
  it("marks os.platform and os.tmpdir as gating and realpath, windowsEnv and parentEnv as reported only", () => {
    const report = buildProbeReport(probeInput());

    // The classification is read back off the returned array rather than off the
    // constant, so a report that silently dropped or reordered the gate table
    // fails here.
    expect(report.capabilities).toHaveLength(PROBE_CAPABILITIES.length);
    expect(
      report.capabilities
        .filter((entry) => entry.gating)
        .map((entry) => entry.name),
    ).toEqual(["os.platform", "os.tmpdir"]);
    expect(
      report.capabilities
        .filter((entry) => !entry.gating)
        .map((entry) => entry.name),
    ).toEqual(["realpath", "windowsEnv", "parentEnv"]);

    // The load-bearing consequence of the split: a missing realpath does NOT
    // block, an unrecognised platform DOES.
    const realpathMissing = buildProbeReport(
      probeInput({ realpathRung: undefined }),
    );
    expect(capabilityNamed(realpathMissing, "realpath").ok).toBe(false);
    expect(realpathMissing.ok).toBe(true);

    const unrecognisedPlatform = buildProbeReport(
      probeInput({ rawPlatform: "freebsd", normalizedPlatform: undefined }),
    );
    expect(capabilityNamed(unrecognisedPlatform, "os.platform").ok).toBe(false);
    expect(unrecognisedPlatform.ok).toBe(false);
    expect(
      capabilityNamed(unrecognisedPlatform, "os.platform").detail,
    ).toContain(
      'os.platform() returned "freebsd", which Drift does not recognise',
    );
  });

  it("keeps ok true when only reported capabilities fail", () => {
    const report = buildProbeReport(
      probeInput({
        normalizedPlatform: "win32",
        rawPlatform: "win32",
        realpathRung: undefined,
        windowsEnvPresent: {
          USERPROFILE: false,
          APPDATA: false,
          LOCALAPPDATA: false,
        },
      }),
    );

    expect(capabilityNamed(report, "realpath").ok).toBe(false);
    expect(capabilityNamed(report, "windowsEnv").ok).toBe(false);
    expect(capabilityNamed(report, "os.platform").ok).toBe(true);
    expect(capabilityNamed(report, "os.tmpdir").ok).toBe(true);
    expect(report.ok).toBe(true);
  });

  it("records the realpath rung reached in the capability detail", () => {
    // The rung Caido actually reaches. Reporting it is the highest-value single
    // field in the report for Phase 6's design.
    const resolved = buildProbeReport(
      probeInput({ realpathRung: "path.resolve" }),
    );
    expect(capabilityNamed(resolved, "realpath").detail).toContain(
      "path.resolve",
    );

    const native = buildProbeReport(
      probeInput({ realpathRung: "realpathSync.native" }),
    );
    expect(capabilityNamed(native, "realpath").detail).toContain(
      "realpathSync.native",
    );
  });

  it("appends the realpath rung note verbatim and distinguishes not probed from absent", () => {
    const note =
      'realpathSync.native: not probed - probing it needs a module-scope bare "fs" import that is unverified under Caido\'s LLRT';

    const withNote = buildProbeReport(
      probeInput({ realpathRung: "path.resolve", realpathRungNote: note }),
    );
    const withoutNote = buildProbeReport(
      probeInput({ realpathRung: "path.resolve" }),
    );

    const detail = capabilityNamed(withNote, "realpath").detail;

    // "we did not look" must never be readable as "it is not there". This is the
    // guard against a later reader upgrading the claim.
    expect(detail).toContain("not probed");
    expect(detail).not.toContain("absent");

    // The note is appended verbatim, and nothing else about the detail moves.
    expect(detail).toBe(
      `${capabilityNamed(withoutNote, "realpath").detail}; ${note}`,
    );
  });

  it("reports Windows env vars as presence booleans and never their values", () => {
    const report = buildProbeReport(
      probeInput({
        rawPlatform: "win32",
        normalizedPlatform: "win32",
        tmpdir: "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp",
        tempRoot: "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp",
        windowsEnvPresent: {
          USERPROFILE: true,
          APPDATA: true,
          LOCALAPPDATA: false,
        },
      }),
    );

    const detail = capabilityNamed(report, "windowsEnv").detail;
    expect(detail).toContain("USERPROFILE=present");
    expect(detail).toContain("APPDATA=present");
    expect(detail).toContain("LOCALAPPDATA=missing");

    // The values carry the user's real account name and this string is pasted
    // into public bug reports (T-04-04).
    expect(detail).not.toContain("C:\\");
  });

  it("computes tempRootLength and projectedWorstCasePathLength", () => {
    // Phase 3's measured 8.3 short form, 36 characters (03-FINDINGS.md P0-TMP).
    const tempRoot = "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp";
    expect(tempRoot).toHaveLength(36);

    const report = buildProbeReport(probeInput({ tempRoot }));

    // 36 + 31 (\drift-mcp-<20 hex>) + 41 (\copilot-mcp-chat-<13>-<4>.json) = 108.
    expect(report.metrics).toEqual({
      tempRootLength: "36",
      projectedWorstCasePathLength: "108",
      parentEnvKeyCount: "unavailable",
      parentEnvPathEntryCount: "unavailable",
    });

    const absent = buildProbeReport(
      probeInput({ tmpdir: undefined, tempRoot: undefined }),
    );
    expect(absent.metrics).toEqual({
      tempRootLength: "unavailable",
      projectedWorstCasePathLength: "unavailable",
      parentEnvKeyCount: "unavailable",
      parentEnvPathEntryCount: "unavailable",
    });
  });
});
// ── D-05's reported parentEnv row (RUN-02) ─────────────────────────────────
//
// Every case here injects the environment as a parameter, which is the whole
// reason a Linux runner can prove a Windows-shaped `Path` block at all. The
// row REPORTS and never GATES: the MCP server is spawned by an absolute node
// path and mcp-server.mjs spawns nothing itself, so a thin or absent PATH
// cannot break the Phase 5 health-check path (05-CONTEXT.md D-05, Phase 4 D-06).
describe("buildProbeReport parentEnv row", () => {
  it("registers a fifth non-gating capability with a matching purpose clause", () => {
    // Read off the constant itself, not off a report, so a row added without a
    // CAPABILITY_PURPOSE entry — or a purpose entry with no row — fails here.
    expect(PROBE_CAPABILITIES).toHaveLength(5);
    expect(Object.keys(CAPABILITY_PURPOSE)).toHaveLength(5);
    expect(Object.keys(CAPABILITY_PURPOSE).sort()).toEqual(
      PROBE_CAPABILITIES.map((entry) => entry.name).sort(),
    );

    const entry = PROBE_CAPABILITIES.find(
      (candidate) => candidate.name === "parentEnv",
    );
    expect(entry).toBeDefined();
    expect(entry?.gating).toBe(false);
    expect(entry?.label).toBe("Parent process environment");
  });

  it("reports not probed, never the digit 0, when no environment was supplied", () => {
    const report = buildProbeReport(probeInput());
    const row = capabilityNamed(report, "parentEnv");

    expect(row.gating).toBe(false);
    expect(row.ok).toBe(true);
    expect(row.detail).toContain("not probed");

    // "unavailable" is the module's standing marker for a measurement Drift
    // never took. Rendering 0 here would be a confidently wrong integer.
    expect(report.metrics["parentEnvKeyCount"]).toBe("unavailable");
    expect(report.metrics["parentEnvPathEntryCount"]).toBe("unavailable");
    expect(report.metrics["parentEnvKeyCount"]).not.toBe("0");
    expect(report.metrics["parentEnvPathEntryCount"]).not.toBe("0");
  });

  it("counts keys and colon-separated PATH entries on a POSIX platform", () => {
    const report = buildProbeReport(
      probeInput({ parentEnv: { PATH: "/usr/bin:/bin", HOME: "/x" } }),
    );

    expect(report.metrics["parentEnvKeyCount"]).toBe("2");
    expect(report.metrics["parentEnvPathEntryCount"]).toBe("2");
  });

  it("resolves the PATH key case-insensitively and splits on the semicolon on win32", () => {
    // A Windows parent block spells it `Path`. Environment keys are
    // case-insensitive there, so a case-sensitive lookup would report the
    // variable absent on the one platform this release exists to fix.
    const report = buildProbeReport(
      probeInput({
        rawPlatform: "win32",
        normalizedPlatform: "win32",
        parentEnv: { Path: "C:\\a;C:\\b;C:\\c" },
      }),
    );

    expect(report.metrics["parentEnvPathEntryCount"]).toBe("3");
  });

  it("chooses the separator from the platform, not by guessing from the content", () => {
    // A semicolon inside a POSIX PATH is one entry containing a semicolon, not
    // two entries. Sniffing the content would invent a second one.
    const report = buildProbeReport(
      probeInput({ parentEnv: { PATH: "/usr/bin;/bin" } }),
    );

    expect(report.metrics["parentEnvPathEntryCount"]).toBe("1");
  });

  it("distinguishes an absent PATH variable from an environment it never probed", () => {
    const report = buildProbeReport(probeInput({ parentEnv: { HOME: "/x" } }));
    const row = capabilityNamed(report, "parentEnv");

    expect(row.ok).toBe(true);
    expect(row.detail).toContain("absent");
    expect(report.metrics["parentEnvKeyCount"]).toBe("1");
    expect(report.metrics["parentEnvPathEntryCount"]).toBe("absent");
  });

  it("reports the key count but not the PATH entry count when the platform is unknown", () => {
    // The separator is a function of the platform. With no platform there is no
    // separator, and a split would produce a confidently wrong integer.
    const report = buildProbeReport(
      probeInput({
        rawPlatform: undefined,
        normalizedPlatform: undefined,
        parentEnv: { PATH: "/usr/bin:/bin" },
      }),
    );

    expect(report.metrics["parentEnvKeyCount"]).toBe("1");
    expect(report.metrics["parentEnvPathEntryCount"]).toBe("unavailable");
  });

  it("drops empty and whitespace-only PATH segments", () => {
    expect(
      buildProbeReport(probeInput({ parentEnv: { PATH: "/usr/bin::/bin" } }))
        .metrics["parentEnvPathEntryCount"],
    ).toBe("2");

    expect(
      buildProbeReport(
        probeInput({ parentEnv: { PATH: "  /usr/bin :  : /bin " } }),
      ).metrics["parentEnvPathEntryCount"],
    ).toBe("2");

    expect(
      buildProbeReport(probeInput({ parentEnv: { PATH: "" } })).metrics[
        "parentEnvPathEntryCount"
      ],
    ).toBe("0");
  });

  it("never emits an environment key name or value", () => {
    const report = buildProbeReport(
      probeInput({
        parentEnv: {
          DRIFT_FIXTURE_SENTINEL_KEY: "sentinel-value-9f3a",
          PATH: "/usr/bin:/bin",
        },
      }),
    );
    const row = capabilityNamed(report, "parentEnv");

    expect(row.detail).not.toContain("DRIFT_FIXTURE_SENTINEL_KEY");
    expect(row.detail).not.toContain("sentinel-value-9f3a");
    expect(row.detail).not.toContain("/usr/bin");
    expect(Object.values(report.metrics).join(" ")).not.toContain(
      "sentinel-value-9f3a",
    );
  });

  it("renders not probed and absent as different strings, not the same string twice", () => {
    // T-05-11. Asserting only that both are non-empty would pass under an
    // implementation that renders one string for both states, which is the
    // exact failure this case exists to catch.
    const neverProbed = buildProbeReport(probeInput());
    const probedWithoutPath = buildProbeReport(
      probeInput({ parentEnv: { HOME: "/x" } }),
    );

    expect(neverProbed.metrics["parentEnvPathEntryCount"]).not.toBe(
      probedWithoutPath.metrics["parentEnvPathEntryCount"],
    );

    const neverProbedDetail = capabilityNamed(neverProbed, "parentEnv").detail;
    const absentDetail = capabilityNamed(probedWithoutPath, "parentEnv").detail;

    // The absent branch must actually use the word, or the negative assertion
    // below would hold vacuously.
    expect(absentDetail).toContain("absent");
    expect(neverProbedDetail).not.toContain("absent");
  });

  it("leaks neither a key name nor a value through the flattened diagnostics fields", () => {
    // The flattened Record is what getDiagnostics collects into the support
    // bundle a user pastes into a public bug report (T-05-10).
    const report = buildProbeReport(
      probeInput({
        parentEnv: {
          DRIFT_FIXTURE_SENTINEL_KEY: "sentinel-value-9f3a",
          PATH: "/usr/bin:/bin",
        },
      }),
    );
    const flattened = Object.entries(formatProbeReportFields(report))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Premise first: an empty string would satisfy both negatives vacuously.
    expect(flattened.length).toBeGreaterThan(0);
    expect(flattened).toContain("parentEnvKeyCount=2");

    expect(flattened).not.toContain("DRIFT_FIXTURE_SENTINEL_KEY");
    expect(flattened).not.toContain("sentinel-value-9f3a");
  });

  it("REPORTS and never GATES: the worst parentEnv outcome leaves report.ok true", () => {
    // Supplied, and carrying no PATH under any casing — the worst case this row
    // can observe. Gating on it would refuse to start the MCP server on a
    // runtime where the health check demonstrably works (D-05's rejected
    // alternative), because the server is spawned by an absolute node path.
    const report = buildProbeReport(probeInput({ parentEnv: { HOME: "/x" } }));

    expect(capabilityNamed(report, "parentEnv").ok).toBe(true);
    expect(capabilityNamed(report, "parentEnv").gating).toBe(false);
    expect(report.ok).toBe(true);
  });
});

describe("formatProbeReportFields", () => {
  it("flattens capabilities under a runtime prefix and passes version and metrics through", () => {
    const report = buildProbeReport(
      probeInput({ version: { driftVersion: "0.1.0" } }),
    );
    const fields = formatProbeReportFields(report);

    expect(Object.keys(fields)).toEqual([
      "runtimeOsPlatform",
      "runtimeOsTmpdir",
      "runtimeRealpath",
      "runtimeWindowsEnv",
      "runtimeParentEnv",
      "driftVersion",
      "tempRootLength",
      "projectedWorstCasePathLength",
      "parentEnvKeyCount",
      "parentEnvPathEntryCount",
    ]);
    expect(fields["driftVersion"]).toBe("0.1.0");
    expect(fields["runtimeOsPlatform"]).toContain("gating");
    expect(fields["runtimeRealpath"]).toContain("reported");
  });
});

describe("formatProbeFailure", () => {
  it("renders every version-block field, using unavailable for each source that throws", () => {
    // D-08: each read is individually guarded, so a source that threw still gets
    // a line. A hole in the block is indistinguishable from a field the reporter
    // forgot to paste.
    const version = {
      driftVersion: "0.1.0",
      processVersion: "unavailable",
      versionsNode: "unavailable",
      versionsLlrt: "unavailable",
      osPlatform: "unavailable",
      osRelease: "unavailable",
    };
    const report = buildProbeReport(
      probeInput({ tmpdir: undefined, tempRoot: undefined, version }),
    );
    const message = formatProbeFailure(report);

    expect(message).toContain("driftVersion: 0.1.0");
    expect(message).toContain("processVersion: unavailable");
    expect(message).toContain("versionsNode: unavailable");
    expect(message).toContain("versionsLlrt: unavailable");
    expect(message).toContain("osPlatform: unavailable");
    expect(message).toContain("osRelease: unavailable");
  });

  it("names the missing primitive, what Drift needed it for, and the remedy", () => {
    const report = buildProbeReport(
      probeInput({ tmpdir: undefined, tempRoot: undefined }),
    );
    const message = formatProbeFailure(report);

    // (a) which primitive, (b) what for, (c) the remedy.
    expect(message).toContain("Temp directory");
    expect(message).toContain("os.tmpdir");
    expect(message).toContain("mcp-server.mjs");
    expect(message).toContain("Start MCP");

    // (e) the reported capabilities ride along even though they did not block.
    expect(message).toContain("realpath");
    // (f) the metrics.
    expect(message).toContain("projectedWorstCasePathLength");
  });

  it("leads with the first-write failure when one is supplied", () => {
    // D-07: the probe wraps the REAL first write, so this is the failure users
    // actually hit — a read-only or Defender-locked temp dir passes any
    // stat()-only check and then dies at the copy.
    const report = buildProbeReport(probeInput());
    const message = formatProbeFailure(report, {
      firstWriteError: "EPERM: operation not permitted",
      firstWriteAttempts: 6,
    });

    expect(message.split("\n")[0]).toContain(
      "first write to its temp directory failed",
    );
    expect(message).toContain("EPERM: operation not permitted");
    expect(message).toContain("Attempts before giving up: 6");
  });

  it("never contains a CAIDO_TOKEN value", () => {
    // T-04-04 regression tripwire. Neither fixture is passed into the report at
    // any point; the assertion exists so a future field that DOES reach for the
    // environment fails here instead of in a public bug report.
    const tokenFixture = "caido_tok_9f8e7d6c5b4a3928170655e4d3c2b1a0";
    const profileValueFixture = "C:\\Users\\alexander.hamilton";

    const report = buildProbeReport(
      probeInput({
        rawPlatform: "win32",
        normalizedPlatform: "win32",
        tmpdir: undefined,
        tempRoot: undefined,
        windowsEnvPresent: {
          USERPROFILE: true,
          APPDATA: true,
          LOCALAPPDATA: false,
        },
        version: { driftVersion: "0.1.0", processVersion: "unavailable" },
      }),
    );
    const message = formatProbeFailure(report, {
      firstWriteError: "EPERM: operation not permitted",
      firstWriteAttempts: 6,
    });

    // Positive control first, so the negatives below cannot pass vacuously: the
    // variable NAMES do render.
    expect(message).toContain("USERPROFILE=present");
    expect(message).toContain("LOCALAPPDATA=missing");

    expect(message).not.toContain("CAIDO_TOKEN");
    expect(message).not.toContain(tokenFixture);
    expect(message).not.toContain(profileValueFixture);
    expect(message).not.toContain("C:\\");
  });
});

describe("normalizePathForCompare", () => {
  it("uses the realpathSync.native ladder rung when it is available", async () => {
    const realpathSyncNative = vi.fn((value: string) => `${value}-canonical`);

    await expect(
      normalizePathForCompare({
        value: "/tmp/drift-mcp-abc",
        deps: { realpathSyncNative },
      }),
    ).resolves.toEqual({
      path: "/tmp/drift-mcp-abc-canonical",
      rung: "realpathSync.native",
    });
    expect(realpathSyncNative).toHaveBeenCalledWith("/tmp/drift-mcp-abc");
  });

  it("falls back to fs.realpath when realpathSync.native is absent", async () => {
    const realpath = vi.fn(async (value: string) => `${value}-canonical`);

    await expect(
      normalizePathForCompare({
        value: "/tmp/drift-mcp-abc",
        deps: { realpath },
      }),
    ).resolves.toEqual({
      path: "/tmp/drift-mcp-abc-canonical",
      rung: "fs.realpath",
    });
    expect(realpath).toHaveBeenCalledWith("/tmp/drift-mcp-abc");
  });

  it("falls through the ladder to path.resolve when both upper rungs are absent", async () => {
    // This is the rung Caido will ACTUALLY reach: there is no `realpath` or
    // `realpathSync` symbol anywhere in caido/dependency-llrt@main's fs module
    // (04-RESEARCH.md § LLRT Surface Risk, § Open Questions 2), so rungs 1 and 2
    // are both absent in production and this test is the one that describes the
    // shipped behaviour rather than the hoped-for one.
    await expect(
      normalizePathForCompare({ value: "drift-mcp-abc", deps: {} }),
    ).resolves.toEqual({
      path: path.resolve("drift-mcp-abc"),
      rung: "path.resolve",
    });

    // Same answer with no `deps` key at all, which is how index.ts will call it
    // once the runtime turns out to have neither upper rung.
    await expect(
      normalizePathForCompare({ value: "drift-mcp-abc" }),
    ).resolves.toEqual({
      path: path.resolve("drift-mcp-abc"),
      rung: "path.resolve",
    });
  });

  it("falls through to path.resolve when an upper rung throws", async () => {
    const throwingNative = vi.fn((): string => {
      throw new Error("realpathSync.native is not a function");
    });
    const realpath = vi.fn(async (value: string) => `${value}-canonical`);

    // Rung 1 throws, rung 2 present -> lands on rung 2.
    await expect(
      normalizePathForCompare({
        value: "/tmp/drift-mcp-abc",
        deps: { realpathSyncNative: throwingNative, realpath },
      }),
    ).resolves.toEqual({
      path: "/tmp/drift-mcp-abc-canonical",
      rung: "fs.realpath",
    });

    // Rung 1 throws, rung 2 absent -> lands on rung 3.
    await expect(
      normalizePathForCompare({
        value: "/tmp/drift-mcp-abc",
        deps: { realpathSyncNative: throwingNative },
      }),
    ).resolves.toEqual({
      path: path.resolve("/tmp/drift-mcp-abc"),
      rung: "path.resolve",
    });

    expect(throwingNative).toHaveBeenCalledTimes(2);
  });

  it("never throws", async () => {
    // Every rung fails, including the bottom one. The contract is "always
    // returns": a throw here would escape startMcpServer's Result branch
    // entirely, which is the failure mode the guard exists to prevent (T-04-12).
    await expect(
      normalizePathForCompare({
        value: "/tmp/drift-mcp-abc",
        deps: {
          realpathSyncNative: () => {
            throw new Error("rung 1 unavailable");
          },
          realpath: async () => {
            throw new Error("rung 2 unavailable");
          },
          resolve: () => {
            throw new Error("rung 3 unavailable");
          },
        },
      }),
    ).resolves.toEqual({ path: "/tmp/drift-mcp-abc", rung: "path.resolve" });
  });
});
