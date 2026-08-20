// RUN-05's capability report and the failure message a Windows bug reporter
// pastes into an issue, kept PURE so that message is unit-tested rather than
// assembled inline in the untested 3,004-line index.ts. index.ts collects the
// facts — the single guarded `os` read D-02 allows, the manifest version, the
// first-write error — and this module only SHAPES them. Nothing here logs: the
// module cannot reach `sdk.console` and must not, because a formatter that logs
// is a formatter whose output cannot be asserted.
//
// The only import is `path`, and it is here for exactly one reason: the bottom
// rung of the D-04 ladder. `os` is deliberately absent (D-02 puts the single
// read in index.ts, so that an LLRT gap is a loud MCP-start error rather than a
// module-evaluation throw that kills the whole plugin). `fs` is deliberately
// absent too — normalizePathForCompare takes its fs rungs as INJECTED
// parameters precisely because that surface is unproven under Caido's LLRT.
// `./platform` is absent by choice as well: this module deals in raw strings and
// booleans, which keeps it buildable in the same wave as platform.ts and keeps a
// formatter free of a domain union it does not need. Plan 04-08 passes both the
// raw os.platform() value and the normalised one.
//
// Security (V7 / T-04-04): every field this module emits is a version string, a
// path, a boolean or an integer. It never enumerates the process environment and
// never carries the Caido token. `redactDebugText` (index.ts:349) covers the
// debug log; the probe report is a DIFFERENT surface — it is pasted into public
// bug reports — and needs its own no-secrets discipline. Windows profile
// variables therefore render as presence booleans BY NAME, never as values,
// because their values contain the user's real account name. The parentEnv row
// added for D-05 holds the same line by emitting integers and status words
// only: counting is not enumerating, so the standing rule that this module
// never enumerates the process environment survives literally — neither a key
// name nor a value ever leaves it (T-05-10).

import path from "path";

// ── D-06's gate table, encoded as DATA rather than as control flow ──────────
//
// The rule: a primitive with a working fallback REPORTS; a primitive without one
// GATES. Encoding it as a fixed-order array (the MCP_SELF_TEST_CHECKS shape at
// mcp-runtime.ts:21-25) means three things at once — the report always renders
// identically, a test can iterate it, and the classification is assertable
// instead of being implied by an `if` somewhere in a 3,000-line file.
export const PROBE_CAPABILITIES = [
  {
    name: "os.platform",
    label: "OS platform detection",
    // GATES (D-06). Nothing downstream branches correctly without a recognised
    // platform, and the failure is not a crash but a silent wrong answer: an
    // unrecognised value falls through to the POSIX arm, which on Windows *is*
    // the reported bug reintroduced one layer up.
    gating: true,
  },
  {
    name: "os.tmpdir",
    label: "Temp directory",
    // GATES (D-06). Every runtime file depends on it — mcp-server.mjs, the
    // token-bearing MCP wrapper, the per-session context, approval and activity
    // files. There is no fallback that is not a hardcoded /tmp, and shipping
    // that fallback is what made the Windows path dead while POSIX quietly
    // worked (D-05: hard-fail on every OS, one code path, one message).
    gating: true,
  },
  {
    name: "realpath",
    label: "Path canonicalisation",
    // REPORTS, never gates (D-06). D-04's ladder already degrades to
    // path.resolve, so an absent realpath is a legible report line rather than
    // a blocked MCP start.
    gating: false,
  },
  {
    name: "windowsEnv",
    label: "Windows profile environment variables",
    // REPORTS, never gates (D-06). These are Phase 6's inputs — the nvm/fnm and
    // install-location candidate arrays — and have no Phase 4 consumer at all.
    // Blocking MCP for a capability nothing reads yet would be a regression
    // dressed up as strictness.
    gating: false,
  },
  {
    name: "parentEnv",
    label: "Parent process environment",
    // REPORTS, never gates (D-06 / 05-CONTEXT.md D-05). The fallback is real:
    // the MCP server is spawned by an ABSOLUTE node path and mcp-server.mjs
    // spawns nothing itself, so a thin or entirely missing PATH cannot break
    // the Phase 5 health-check path. It can only bite the provider CLI, which
    // is Phase 7's PRV-01. Gating on it would refuse to start Drift on a
    // runtime where the health check demonstrably works — D-05's explicitly
    // rejected alternative.
    gating: false,
  },
] as const;

export type ProbeCapabilityResult = {
  name: string;
  label: string;
  gating: boolean;
  ok: boolean;
  detail: string;
};

export type ProbeReport = {
  ok: boolean;
  capabilities: ProbeCapabilityResult[];
  version: Record<string, string>;
  metrics: Record<string, string>;
};

// The three rungs of D-04's ladder, in descending order of trust. The return
// value of normalizePathForCompare names the one actually reached — see the
// comment block above that export for why that reporting is load-bearing.
export type RealpathRung =
  | "realpathSync.native"
  | "fs.realpath"
  | "path.resolve";

type ProbeCapabilityName = (typeof PROBE_CAPABILITIES)[number]["name"];

type CapabilityOutcome = { ok: boolean; detail: string };

// D-08's sentinel. Rendered for any version source whose read threw, so the
// block a bug reporter pastes has a line for every field rather than a hole.
const UNAVAILABLE = "unavailable";

// Used wherever a value is missing in a position that would otherwise print the
// bare word "undefined" with no context.
const NOT_AVAILABLE = "not available";

// Rendered ONLY for a measurement Drift actually took whose subject turned out
// not to be there. Deliberately a different string from UNAVAILABLE, which
// marks a measurement Drift never took at all. Phase 4's 04-03 spent a plan on
// this distinction, and a test asserts the two render differently: a report
// written to be pasted into a public bug report must never assert a measurement
// Drift did not make (T-05-11).
const ABSENT = "absent";

// The one environment key name this module is allowed to say out loud. Compared
// case-insensitively because Windows environment keys are case-insensitive and
// a parent block spelling it `Path` must be MEASURED, not reported absent.
const PATH_VARIABLE_NAME = "PATH";

// ── SC-3's MAX_PATH guard-rail (04-RESEARCH.md § MAX_PATH Budgeting) ────────
//
// MAX_PATH is 260 characters INCLUDING the terminating NUL, so 259 usable for a
// fully-qualified path. Opting out requires BOTH the
// HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled DWORD AND a
// `longPathAware` application manifest — and Drift controls neither, because the
// process is Caido's. Assume 259 and do not rely on long-path opt-in.
//
// The two components Drift appends to the temp root, at the shortened sizes plan
// 04-08 adopts:
//
//   "\" + "drift-mcp-" + 20 hex chars                             = 31
//   "\" + "copilot-mcp-chat-<13 digits>-<4 chars>.json"           = 41  (longest leaf)
//
// so projectedWorstCasePathLength = tempRootLength + 31 + 41, and the temp root
// itself may run to 259 - 72 = 187 characters before anything breaks.
//
// The one thing Drift genuinely cannot know is how long THIS user's temp root is
// — a redirected %TMP%, a UNC share or a Citrix/VDI redirect is the real risk.
// Reporting these two integers converts that unknowable into a line a bug
// reporter pastes, at zero extra I/O.
const MAX_PATH_DIR_COMPONENT_CHARS = 31;
const MAX_PATH_LEAF_COMPONENT_CHARS = 41;

// Why Drift needed each gating primitive, in the words the failure message uses.
// Keyed by capability name so a new entry in PROBE_CAPABILITIES cannot silently
// render a message with no "what for" clause.
// Exported so the suite can assert it has an entry for EVERY capability name
// rather than trusting the compiler's Record exhaustiveness alone: the point of
// keying by name is that a new PROBE_CAPABILITIES row cannot ship without a
// what-for clause, and that guarantee should be falsifiable at runtime too.
export const CAPABILITY_PURPOSE: Record<ProbeCapabilityName, string> = {
  "os.platform":
    "Drift needs the platform name to choose between the POSIX and the Windows launch path; guessing wrong is exactly the Windows failure this release exists to fix.",
  "os.tmpdir":
    "Drift needs a temp directory to stage mcp-server.mjs and the token-bearing MCP wrapper that the AI CLI executes.",
  realpath:
    "Drift uses path canonicalisation only to compare a temp path against a profile-derived path; the fallback keeps working without it.",
  windowsEnv:
    "Drift reads these to locate Node and the AI CLI binaries installed under a Windows user profile.",
  parentEnv:
    "Drift builds every child process's environment from the parent block rather than inheriting a shell's, so the size of that block and the number of PATH entries are what a Windows or Dock-launched macOS user needs to paste when a CLI cannot be found.",
};

function trimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function describePlatformCapability(input: {
  rawPlatform: string | undefined;
  normalizedPlatform: string | undefined;
}): CapabilityOutcome {
  const raw = trimmed(input.rawPlatform);
  const normalized = trimmed(input.normalizedPlatform);

  if (normalized !== "") {
    return {
      ok: true,
      detail: `os.platform() returned "${raw !== "" ? raw : normalized}", recognised as ${normalized}`,
    };
  }

  if (raw !== "") {
    return {
      ok: false,
      detail: `os.platform() returned "${raw}", which Drift does not recognise`,
    };
  }

  return { ok: false, detail: `os.platform() is ${NOT_AVAILABLE}` };
}

function describeTmpdirCapability(input: {
  tmpdir: string | undefined;
  tempRoot: string | undefined;
}): CapabilityOutcome {
  const tmpdir = trimmed(input.tmpdir);
  const tempRoot = trimmed(input.tempRoot);

  if (tmpdir === "") {
    return { ok: false, detail: `os.tmpdir() is ${NOT_AVAILABLE}` };
  }

  return {
    ok: true,
    detail: `os.tmpdir() returned "${tmpdir}"; Drift's temp root resolves to ${
      tempRoot !== "" ? `"${tempRoot}"` : NOT_AVAILABLE
    }`,
  };
}

function describeRealpathCapability(input: {
  realpathRung: RealpathRung | undefined;
  realpathRungNote?: string;
}): CapabilityOutcome {
  const note = trimmed(input.realpathRungNote);
  const rung = input.realpathRung;

  // `ok` is true whenever ANY rung was reached, because the ladder always
  // terminates at path.resolve. Under Caido this field will read `path.resolve`
  // — there is no `realpath` or `realpathSync` symbol anywhere in
  // caido/dependency-llrt@main's fs module (04-RESEARCH.md § LLRT Surface Risk).
  // That is the expected answer, not a failure, and it is the single
  // highest-value field in the whole report for Phase 6's design.
  const base =
    rung === undefined
      ? "no path-canonicalisation rung was reached"
      : `path canonicalisation reached the ${rung} rung`;

  // The realpathRungNote hook exists for one specific honesty requirement. Plan
  // 04-08's runtime detector cannot probe rung 1 (realpathSync.native) at all,
  // because doing so would need a module-scope import of the bare "fs"
  // specifier, which is not source-verified for Caido's LLRT and would kill the
  // whole plugin at load if it failed to resolve. The note therefore carries
  // `not probed`, which is a DIFFERENT claim from `absent`. A report whose whole
  // purpose is to be pasted into a public bug report must never assert a
  // measurement Drift did not make.
  return {
    ok: rung !== undefined,
    detail: note === "" ? base : `${base}; ${note}`,
  };
}

function describeWindowsEnvCapability(input: {
  normalizedPlatform: string | undefined;
  windowsEnvPresent: Record<string, boolean> | undefined;
}): CapabilityOutcome {
  const normalized = trimmed(input.normalizedPlatform);

  if (normalized !== "win32") {
    return {
      ok: true,
      detail: `not applicable on ${normalized !== "" ? normalized : NOT_AVAILABLE}`,
    };
  }

  const present = input.windowsEnvPresent;
  if (present === undefined) {
    return {
      ok: false,
      detail: "the Windows profile environment variables were not probed",
    };
  }

  // Presence booleans BY NAME. NEVER the values: they contain the user's real
  // account name and this string is pasted into public bug reports (T-04-04).
  const rendered = Object.keys(present)
    .map((name) => `${name}=${present[name] === true ? "present" : "missing"}`)
    .join(" ");

  return {
    ok: present["USERPROFILE"] === true,
    detail:
      rendered === ""
        ? "no Windows profile environment variables were reported"
        : rendered,
  };
}

// Three states, not two, and they are kept apart by the type rather than by a
// magic number. `notProbed` means Drift never looked; `absent` means Drift
// looked and the PATH variable was not there. Collapsing them would make the
// report claim a measurement it did not take (T-05-11).
type PathEntryCount =
  | { kind: "counted"; count: number }
  | { kind: "absent" }
  | { kind: "notProbed" };

function countPathEntries(input: {
  parentEnv: Record<string, string | undefined> | undefined;
  platform: string | undefined;
}): PathEntryCount {
  const parentEnv = input.parentEnv;
  if (parentEnv === undefined) {
    return { kind: "notProbed" };
  }

  // Case-insensitive resolution. Windows environment keys are case-insensitive
  // and a parent block spelling it `Path` must be measured, not reported absent
  // on the one platform this release exists to fix.
  const key = Object.keys(parentEnv).find(
    (candidate) => candidate.toUpperCase() === PATH_VARIABLE_NAME,
  );
  if (key === undefined) {
    return { kind: "absent" };
  }

  const platform = trimmed(input.platform);
  if (platform === "") {
    // The separator is a function of the platform. With no platform there is no
    // separator, and splitting anyway would produce a confidently wrong integer
    // in a field a bug reporter is about to paste.
    return { kind: "notProbed" };
  }

  const separator = platform === "win32" ? ";" : ":";
  const value = parentEnv[key];
  const count = (typeof value === "string" ? value : "")
    .split(separator)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "").length;

  return { kind: "counted", count };
}

function renderPathEntryCount(result: PathEntryCount): string {
  if (result.kind === "counted") {
    return String(result.count);
  }
  return result.kind === "absent" ? ABSENT : UNAVAILABLE;
}

function describeParentEnvCapability(input: {
  normalizedPlatform: string | undefined;
  // Optional, mirroring buildProbeReport's input, so that "the caller did not
  // pass one" and "the caller passed undefined" are the same not-probed state.
  parentEnv?: Record<string, string | undefined>;
}): CapabilityOutcome {
  // This row NEVER fails. It is `ok: true` in every branch because it reports
  // and does not gate (D-05); `report.ok` must be unaffected by anything below.
  const parentEnv = input.parentEnv;
  if (parentEnv === undefined) {
    return {
      ok: true,
      detail: "the parent process environment was not probed",
    };
  }

  // Counts only. Never a key name (other than the literal word PATH), never a
  // value: this string is pasted into public bug reports and the block contains
  // tokens, account names and machine names (T-05-10).
  const keyCount = Object.keys(parentEnv).length;
  const base = `parent environment carries ${String(keyCount)} keys`;
  const pathEntries = countPathEntries({
    parentEnv,
    platform: input.normalizedPlatform,
  });

  if (pathEntries.kind === "absent") {
    return {
      ok: true,
      detail: `${base}; the ${PATH_VARIABLE_NAME} variable is absent from that block`,
    };
  }

  if (pathEntries.kind === "notProbed") {
    return {
      ok: true,
      detail: `${base}; the ${PATH_VARIABLE_NAME} entry count was not probed because the platform is unrecognised, so the separator is unknowable`,
    };
  }

  return {
    ok: true,
    detail: `${base}; ${PATH_VARIABLE_NAME} carries ${String(pathEntries.count)} entries`,
  };
}

function buildProbeMetrics(input: {
  tempRoot: string;
  parentEnv: Record<string, string | undefined> | undefined;
  platform: string | undefined;
}): Record<string, string> {
  const tempRoot = input.tempRoot;
  const pathBudget =
    tempRoot === ""
      ? {
          tempRootLength: UNAVAILABLE,
          projectedWorstCasePathLength: UNAVAILABLE,
        }
      : {
          tempRootLength: String(tempRoot.length),
          projectedWorstCasePathLength: String(
            tempRoot.length +
              MAX_PATH_DIR_COMPONENT_CHARS +
              MAX_PATH_LEAF_COMPONENT_CHARS,
          ),
        };

  return {
    ...pathBudget,
    // UNAVAILABLE, never "0": a key count of zero is a real measurement and an
    // unprobed environment is not one.
    parentEnvKeyCount:
      input.parentEnv === undefined
        ? UNAVAILABLE
        : String(Object.keys(input.parentEnv).length),
    parentEnvPathEntryCount: renderPathEntryCount(
      countPathEntries({
        parentEnv: input.parentEnv,
        platform: input.platform,
      }),
    ),
  };
}

export function buildProbeReport(input: {
  rawPlatform: string | undefined;
  normalizedPlatform: string | undefined;
  tmpdir: string | undefined;
  tempRoot: string | undefined;
  realpathRung: RealpathRung | undefined;
  realpathRungNote?: string;
  windowsEnvPresent: Record<string, boolean> | undefined;
  // OPTIONAL so probeRuntime() in index.ts compiles untouched by this plan;
  // plan 05-04 supplies process.env from index.ts's single probe site.
  parentEnv?: Record<string, string | undefined>;
  version: Record<string, string>;
}): ProbeReport {
  const outcomes: Record<ProbeCapabilityName, CapabilityOutcome> = {
    "os.platform": describePlatformCapability(input),
    "os.tmpdir": describeTmpdirCapability(input),
    realpath: describeRealpathCapability(input),
    windowsEnv: describeWindowsEnvCapability(input),
    parentEnv: describeParentEnvCapability(input),
  };

  // Iterate PROBE_CAPABILITIES rather than Object.entries(outcomes) so the
  // report renders in the one fixed order, always.
  const capabilities = PROBE_CAPABILITIES.map(
    (capability): ProbeCapabilityResult => {
      const outcome = outcomes[capability.name];
      return {
        name: capability.name,
        label: capability.label,
        gating: capability.gating,
        ok: outcome.ok,
        detail: outcome.detail,
      };
    },
  );

  return {
    // D-06: only the gating capabilities can block. A reported capability lands
    // in the report either way, which is the entire point of the split.
    ok: capabilities.every((capability) => !capability.gating || capability.ok),
    capabilities,
    version: input.version,
    metrics: buildProbeMetrics({
      tempRoot: trimmed(input.tempRoot),
      parentEnv: input.parentEnv,
      platform: input.normalizedPlatform,
    }),
  };
}

// `os.platform` -> `OsPlatform`, `windowsEnv` -> `WindowsEnv`.
function toFieldKeySuffix(name: string): string {
  return name
    .split(".")
    .map((part) =>
      part === "" ? "" : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join("");
}

// Flattens the report into the flat Record<string, string> shape getDiagnostics
// already collects (index.ts:2771+): capabilities prefixed `runtime`, the D-08
// version block unprefixed, the metrics as-is.
export function formatProbeReportFields(
  report: ProbeReport,
): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const capability of report.capabilities) {
    const status = capability.ok ? "ok" : "FAILED";
    const role = capability.gating ? "gating" : "reported";
    fields[`runtime${toFieldKeySuffix(capability.name)}`] =
      `${status} (${role}): ${capability.detail}`;
  }

  for (const [key, value] of Object.entries(report.version)) {
    fields[key] = value;
  }

  for (const [key, value] of Object.entries(report.metrics)) {
    fields[key] = value;
  }

  return fields;
}

// The user-facing message. Plain text with newlines only — no markdown fences,
// no ANSI — because it lands in the MCP status panel, in sdk.console and in a
// GitHub issue body, and only one of those three renders markdown.
export function formatProbeFailure(
  report: ProbeReport,
  context?: { firstWriteError?: string; firstWriteAttempts?: number },
): string {
  const firstWriteError = trimmed(context?.firstWriteError);
  const failing = report.capabilities.filter(
    (capability) => capability.gating && !capability.ok,
  );
  const reported = report.capabilities.filter(
    (capability) => !capability.gating,
  );
  const lines: string[] = [];

  if (firstWriteError !== "") {
    // D-07: the probe wraps the REAL first write, so this is the failure users
    // actually hit. A read-only or Defender-locked temp dir passes any
    // stat()-only check and then dies at the copy, which is why it leads.
    const attempts =
      typeof context?.firstWriteAttempts === "number"
        ? context.firstWriteAttempts
        : 1;
    lines.push(
      "Drift could not start the MCP server: the first write to its temp directory failed.",
    );
    lines.push("");
    lines.push(`Write error: ${firstWriteError}`);
    lines.push(`Attempts before giving up: ${String(attempts)}`);
    lines.push(`Needed for: ${CAPABILITY_PURPOSE["os.tmpdir"]}`);
    lines.push("");
  } else {
    lines.push(
      "Drift could not start the MCP server: a required runtime capability is missing.",
    );
    lines.push("");
  }

  // (a) which primitive is missing, and its detail; (b) what Drift needed it for.
  //
  // The no-failing-capability line has to say what that MEANS, or it reads as a
  // contradiction of the write-failure lead above it. Under D-07 that pairing is
  // the common case, not an edge one: the write IS the os.tmpdir() assertion, so
  // a temp dir Drift cannot write to still answers os.tmpdir() perfectly well.
  if (failing.length === 0) {
    lines.push(
      firstWriteError !== ""
        ? "Missing capability: none - every runtime primitive answered, so the temp directory itself is the problem (a read-only or full volume, a redirected %TMP%, or an anti-virus lock on the file Drift just wrote)."
        : "Missing capability: none - every gating runtime capability reported ok.",
    );
  } else {
    for (const capability of failing) {
      lines.push(
        `Missing capability: ${capability.label} (${capability.name})`,
      );
      lines.push(`  Observed: ${capability.detail}`);
      lines.push(
        `  Needed for: ${CAPABILITY_PURPOSE[capability.name as ProbeCapabilityName]}`,
      );
    }
  }

  // (c) the remedy.
  lines.push("");
  lines.push(
    "What to do: update Caido, then reopen this panel and press Start MCP. If it still fails, open an issue at the Drift repository and paste the block below.",
  );

  // (d) the version block (D-08). Every field is present; a source that threw
  // renders `unavailable` rather than vanishing.
  lines.push("");
  lines.push("Versions:");
  const versionKeys = Object.keys(report.version);
  if (versionKeys.length === 0) {
    lines.push(`  ${UNAVAILABLE}`);
  } else {
    for (const key of versionKeys) {
      lines.push(`  ${key}: ${report.version[key] ?? UNAVAILABLE}`);
    }
  }

  // (e) the reported (non-gating) capabilities, so an LLRT gap is visible even
  // when it did not block anything.
  lines.push("");
  lines.push("Reported (did not block startup):");
  if (reported.length === 0) {
    lines.push("  none");
  } else {
    for (const capability of reported) {
      lines.push(
        `  ${capability.name}: ${capability.ok ? "ok" : "unavailable"} - ${capability.detail}`,
      );
    }
  }

  // (f) the metrics.
  lines.push("");
  lines.push("Path budget:");
  const metricKeys = Object.keys(report.metrics);
  if (metricKeys.length === 0) {
    lines.push(`  ${UNAVAILABLE}`);
  } else {
    for (const key of metricKeys) {
      lines.push(`  ${key}: ${report.metrics[key] ?? UNAVAILABLE}`);
    }
  }

  return lines.join("\n");
}

// ── D-04: the path-canonicalisation ladder ─────────────────────────────────
//
// !! THIS EXPORT HAS NO PHASE 4 CALLER BY DESIGN. CONTEXT.md D-04 makes Phase 6
// !! its FIRST caller. DO NOT DELETE IT TO SATISFY `--max-warnings 0`.
// If a lint rule ever flags it as unused, 04-VALIDATION.md § Lint note mandates
// an explicit eslint-disable whose comment cites D-04 — never a deletion.
//
// It is IMPURE by design, which is why D-04 puts it OUTSIDE platform.ts (SC-1
// holds that module I/O-free). Its rungs are INJECTED, which is what makes the
// fall-through assertable with fakes on the POSIX runner the maintainer
// actually has.
//
// Why the ladder exists at all: Phase 3 measured os.tmpdir() returning the 8.3
// short form `C:\Users\RUNNER~1\AppData\Local\Temp` while USERPROFILE returned
// the long form `C:\Users\runneradmin` — both valid, both on disk, and NOT
// string-comparable (03-FINDINGS.md § P0-TMP). Phase 6 compares exactly those
// two paths, which is where the mismatch bites.
//
// Which rung actually fires under Caido: the bottom one. There is no `realpath`
// or `realpathSync` symbol anywhere in caido/dependency-llrt@main's fs module
// (04-RESEARCH.md § LLRT Surface Risk), so rungs 1 and 2 are both absent and the
// ladder lands on path.resolve. That is precisely why the return value REPORTS
// the rung reached: a Phase 6 caller must never silently believe it holds a
// canonical path when it holds a path.resolve (T-04-12).
//
// The function never throws. Every rung is guarded, including the bottom one.
export async function normalizePathForCompare(input: {
  value: string;
  deps?: {
    realpathSyncNative?: (p: string) => string;
    realpath?: (p: string) => Promise<string>;
    resolve?: (p: string) => string;
  };
}): Promise<{ path: string; rung: RealpathRung }> {
  const deps = input.deps ?? {};

  const realpathSyncNative = deps.realpathSyncNative;
  if (realpathSyncNative !== undefined) {
    try {
      const resolved = realpathSyncNative(input.value);
      if (typeof resolved === "string" && resolved !== "") {
        return { path: resolved, rung: "realpathSync.native" };
      }
    } catch {
      // Absent, unsupported, or the path does not exist yet. Fall through — an
      // uncanonicalised answer that says so beats a throw at MCP start.
    }
  }

  const realpath = deps.realpath;
  if (realpath !== undefined) {
    try {
      const resolved = await realpath(input.value);
      if (typeof resolved === "string" && resolved !== "") {
        return { path: resolved, rung: "fs.realpath" };
      }
    } catch {
      // Same reasoning as rung 1.
    }
  }

  const resolve = deps.resolve ?? path.resolve;
  try {
    return { path: resolve(input.value), rung: "path.resolve" };
  } catch {
    // Even the bottom rung is guarded: the contract is "always returns". Hand
    // back the input unchanged and still name the rung, so a caller can tell
    // that no canonicalisation happened.
    return { path: input.value, rung: "path.resolve" };
  }
}
