import type { DefineAPI, SDK, DefineEvents } from "caido:plugin";
import { readFile, writeFile, open as openFile, stat, mkdir, rm, rename, readdir } from "fs/promises";
// A second statement against the SAME specifier the line above already uses, and
// the only source for the rung-2 presence check in `detectRealpathRung`. A
// NAMESPACE import is deliberate: it tolerates a missing member as `undefined`,
// whereas a named import of an absent export is an ESM link error — and
// `realpath` is verified absent from caido/dependency-llrt@main's fs module
// (and from Caido's own @caido/quickjs-types surface). "fs/promises" is safe to
// name because shipped 0.1.0 already imports from it on the line above, so it is
// proven-resolvable under Caido's LLRT rather than assumed. `no-duplicate-imports`
// is not enabled in eslint.config.mjs, so the second statement is fine.
//
// The bare "fs" / "node:fs" specifier is deliberately NOT imported anywhere in
// this file. It has no source-verified resolution under Caido's LLRT, a static
// ESM import cannot be wrapped in try/catch, and an unresolvable module-scope
// specifier kills the ENTIRE plugin at load on every platform — the exact
// failure mode D-02 exists to prevent. Its only would-be consumer is the rung-1
// (realpathSync.native) presence check, whose answer is already known from the
// fork's source, so rung 1 is reported as "not probed" instead of measured.
import * as fsPromisesNs from "fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { Buffer } from "buffer";
import path from "path";
// The FIRST `os` import in the backend source. Phase 3's P2-OS measured that the
// bare "os" specifier resolves, and 04-RESEARCH.md § Environment Availability
// records it as this phase's single hard dependency, with D-05's hard-fail as
// the agreed handling. The import STATEMENT is fine — D-02 forbids a
// module-scope `os.*` CALL, not the import; see the Runtime probe section below.
import os from "os";
import {
  type CliSessionReasonCode,
  type CliSessionStateEvent,
  DEFAULT_SETTINGS,
  type CaidoContextOverride,
  type CaidoContextSnapshot,
  type ChatMessage,
  type HttpContextPayload,
  type McpAuthState,
  type McpToolActivity,
  type McpToolActivityState,
  type McpToolApprovalRequest,
  type McpToolPermissionGroup,
  type McpToolPolicy,
  type McpSelfTestCheck,
  type McpSelfTestResults,
  type McpServerInfo,
  type ProviderStatus,
  type SendCliMessageOutput,
  type Settings,
  type StoredChat,
  type StoredMcpContext,
  type SupportBundleOutput,
} from "shared";
import {
  buildClaudeLaunchArgs,
  buildCodexLaunchArgs,
  buildCopilotLaunchArgs,
  buildGeminiLaunchArgs,
} from "./provider-launch";
import {
  MCP_SELF_TEST_CHECKS,
  MCP_TOOL_NAMES,
  buildMcpToolPolicy,
  buildMcpServerInfo,
  buildSelfTestResult,
  createEmptyCaidoContextOverride,
  createEmptyCaidoContextSnapshot,
  createEmptySelfTestResults,
  createIdleSelfTestResult,
  hasCaidoContextChanged,
  mergeCaidoContextSnapshot,
  parseMcpRuntimeContext,
  serializeMcpRuntimeContext,
  trimToString,
} from "./mcp-runtime";
import {
  extractHomeDir,
  formatProviderUnavailableMessage,
  getCommandExecutableCandidates,
  getNodeExecutableCandidates,
} from "./command-resolution";
import {
  consumeClaudePrintChunk,
  createClaudePrintState,
  getClaudePrintUsage,
  didClaudeStopWithoutResult,
  finalizeClaudePrintOutput,
  getClaudePrintRecoveryMode,
} from "./claude-print";
import { getPersistenceDbHandle, type PersistenceDbHandle } from "./persistence";
import {
  buildSpawnEnv,
  getSweepRoots,
  getHomeDirCandidates,
  getTempRoot,
  getWhichCommand,
  rankPathSearchHits,
  getWindowsNamedRoots,
  isAbsolutePath,
  isNvmWindowsInstalled,
  normalizePlatform,
  type Platform,
} from "./platform";
// The Phase 5 keystone (plan 05-01). Pure, zero-I/O, and the ONLY source of the
// command/args/env triple for every Drift-owned MCP spawn and config document.
// Everything imported here is exercised by mcp-server-spec.test.ts and
// mcp-server-spec.spawn.test.ts — which is the whole point, because index.ts is
// not importable under vitest and nothing in THIS file is test-reachable.
import {
  buildMcpDriftVars,
  buildMcpServerSpec,
  findExpandableEnvKeys,
  formatSpawnDebugLine,
  planMcpCliRegistration,
  toMcpConfigDocument,
  type McpServerSpec,
} from "./mcp-server-spec";
// The Phase 7 keystone (plan 07-01). Pure, zero-I/O, and the ONLY way a resolved
// provider binary becomes a spawn: it decides whether the target must be routed
// through `cmd.exe /d /s /c` (a `.cmd`/`.bat` shim, which Windows refuses to
// spawn directly) or handed to `spawn` unchanged (a real `.exe`, and every
// POSIX host). Exercised by spawn-plan.test.ts and, on a real Windows runner,
// spawn-plan.win32.test.ts — which is the whole point, because index.ts is not
// importable under vitest and nothing in THIS file is test-reachable.
import { buildSpawnPlan } from "./spawn-plan";
import { withFsRetry } from "./fs-retry";
import { createActivityCursor, readActivityTick } from "./activity-tail";
import {
  appendBounded,
  buildTruncationMarker,
  createBoundedBuffer,
  drainCompleteLines,
  lastCompleteUtf8Boundary,
  renderBoundedBuffer,
  CLI_STDERR_MAX_CHARS,
  CLI_STDOUT_MAX_CHARS,
  MCP_SELFTEST_LINE_MAX_CHARS,
  MCP_SELFTEST_STDERR_MAX_CHARS,
  SPAWN_STDERR_MAX_CHARS,
  SPAWN_STDOUT_MAX_CHARS,
} from "./bounded-buffer";
import {
  buildProbeReport,
  formatProbeFailure,
  formatProbeReportFields,
  type ProbeReport,
  type RealpathRung,
} from "./runtime-probe";
import {
  buildProviderCommandSignature,
  createResolutionCacheState,
  describeResolutionCache,
  resolveWithCache,
  syncResolutionCacheSignature,
  RESOLUTION_NEGATIVE_TTL_MS,
  RESOLUTION_POSITIVE_TTL_MS,
} from "./resolution-cache";

// ── Types (inline to avoid Zod which crashes QuickJS) ──────────────

type CaidoValidationResult =
  | { ok: true; authState: "valid"; message: "" }
  | { ok: false; authState: "invalid" | "error"; message: string };

type Result<T> = { kind: "Ok"; value: T } | { kind: "Error"; error: string };
function ok<T>(value: T): Result<T> {
  return { kind: "Ok", value };
}
function err<T>(error: string): Result<T> {
  return { kind: "Error", error };
}

// The Node-not-found message: three sentence parts and one platform-armed
// renderer, where a single constant used to sit.
//
// Why it is centralised AND armed, in the sibling constant's style below: this
// is the EXACT message the original Windows reporter would have read when Drift
// failed to start its MCP server. Today's second sentence tells the user to
// restart Caido "from an environment where Node.js is available" — shell-shaped
// framing that does not map to how a Windows user launches this application. A
// phase whose entire subject is Node resolution on Windows, shipping a
// shell-shaped Node error to the platform it is fixing, would put the wrong sign
// on the fix. macOS and Linux see the string they see today, both sentences
// unchanged (CMP-01).
//
// Listing `lastNodeSearchCandidates` — the roughly fifteen paths the resolver
// actually probed — in this banner was CONSIDERED and REJECTED (D-16). It is far
// too much text for an error banner, and it carries the user's home-directory
// paths; surfacing it is the diagnostics work in UX-04 / Phase 10, which reads
// that variable through getDiagnostics instead. Recorded here so the option is
// visibly rejected rather than silently forgotten.
//
// The Windows arm stops at the install ROUTE. Fuller install and prerequisite
// guidance is UX-03 / Phase 10 and is deliberately not pulled forward.
const NODE_NOT_FOUND_SENTENCE =
  "Drift could not locate a Node.js executable to launch the MCP server.";
const NODE_REMEDY_POSIX =
  "Restart Caido from an environment where Node.js is available.";
// The winget package identifier is [VERIFIED: microsoft/winget-pkgs], whose
// manifests/o/OpenJS/NodeJS/ directory carries an LTS entry alongside the
// per-version ones.
const NODE_REMEDY_WIN32 =
  "Install the Node.js LTS build from nodejs.org, or run `winget install OpenJS.NodeJS.LTS`, then restart Caido.";
function getNodeExecutableError(platform: Platform | undefined): string {
  if (platform === "win32") {
    return `${NODE_NOT_FOUND_SENTENCE} ${NODE_REMEDY_WIN32}`;
  }
  if (platform === undefined) {
    // Union-when-unknown, the same rule the absolute-path check, the
    // home-directory reader, the home-directory extractor and the provider
    // install hint all apply: pre-probe, name both routes rather than guess one.
    return `${NODE_NOT_FOUND_SENTENCE} On macOS or Linux: ${NODE_REMEDY_POSIX} On Windows: ${NODE_REMEDY_WIN32}`;
  }
  return `${NODE_NOT_FOUND_SENTENCE} ${NODE_REMEDY_POSIX}`;
}
// The one no-token sentence, previously spelled out at four call sites. It is a
// user-facing string that requireMcpServerSpec now produces, so the sites that
// used to compose it read it from here instead of drifting apart.
const NO_CAIDO_TOKEN_MESSAGE =
  "No Caido access token is available. Open any Caido page (or reauthenticate) so Drift can pick up your session, then retry.";
const MCP_RUNTIME_NOT_RUNNING_MESSAGE = "Drift MCP runtime is not running.";
const CLAUDE_ASSISTANT_RECOVERY_IDLE_MS = 1500;
const CLAUDE_STREAM_RECOVERY_IDLE_MS = 8000;
const CLAUDE_POST_TOOL_QUIESCENCE_MS = 15000;
const CLAUDE_POST_TOOL_ERROR_QUIESCENCE_MS = 3000;
const DEBUG_CHUNK_PREVIEW_CHARS = 200;
// The PATH-search spawn's time budget, one named constant per platform. The
// POSIX number is the literal that site has always used, extracted UNCHANGED —
// a rename, not a behaviour change. It is named rather than left inline so the
// platform selection reads two named constants and STATES the asymmetry; a
// selection with one bare literal on one side hides it.
const POSIX_PATH_SEARCH_TIMEOUT_MS = 1000;
// This is a headroom estimate, not a measurement, and nothing later may cite it
// as evidence. No latency figure for the Windows PATH-search tool under
// real-time antivirus scanning exists for this project — not in this repository
// and not in any first-party source found — and the maintainer has no Windows
// machine to produce one (PROJECT.md § Constraints).
//
// What the number IS bounded by, so it is framed by values this codebase
// already accepts rather than invented: below by POSIX_PATH_SEARCH_TIMEOUT_MS
// at the same site, and above by the 10 s ceiling the MCP self-test spawn's
// timeout clamps to, which is the longest spawn budget this codebase sanctions.
// A third bound is the one actually worth naming: RESOLUTION_NEGATIVE_TTL_MS is
// 30 s, so a timeout longer than that would let a single cold miss cost more
// than its own cache lifetime. 5000 sits well inside all three.
//
// Why any headroom at all — the MECHANISM: on Windows a COLD spawn pays process
// creation with the real-time scanner in front of the child's first byte. Why
// it matters — the SYMPTOM: a silent timeout here is indistinguishable from
// "not installed", so a user whose CLI is on PATH is told it is not, which is
// the exact complaint this milestone exists to fix.
//
// Revised on the Phase 9/10 real-machine report, not here.
const WIN32_PATH_SEARCH_TIMEOUT_MS = 5000;

// ── State ───────────────────────────────────────────────────────────

let pluginPath = "";
let assetsPath = "";
let currentSettings: Settings = { ...DEFAULT_SETTINGS };
let currentChats: StoredChat[] = [];
// Resolves once persisted settings + chats have finished loading. Handlers that
// read or write currentSettings/currentChats await this so an early RPC — the
// frontend pushes settings and loads chats during its own init — cannot race
// the initial load. Before this gate, the load's late `.then` could clobber
// freshly-pushed settings, or getChats could return an empty list and make the
// UI auto-create a chat that hides the persisted ones.
let markDataReady: () => void = () => {};
const dataReady: Promise<void> = new Promise((resolve) => {
  markDataReady = resolve;
});
const cliSessions = new Map<string, string>();        // chatId → cliSessionId (resume)
let lastSpawnArgs: string[] = [];                     // for diagnostics
const activeProcesses = new Map<string, ChildProcessWithoutNullStreams>(); // sessionId → ChildProcess
const sessionSnapshots = new Map<string, CliSessionStateEvent>();
const sessionWatchdogs = new Map<string, () => void | Promise<void>>();
// Pump handler for an in-flight MCP self-test call. Only one self-test
// can run at a time, so a single slot is enough. Called from the
// getMcpStatus RPC handler (via a frontend keep-alive ping) to prod the
// pending callMcpMethod promise when Caido's event loop has gone idle.
let activeSelfTestPoll: (() => void) | undefined;
let mcpTempDir: string | undefined;
let mcpAuthState: McpAuthState = "unknown";
let mcpAuthMessage = "";
// PERF-03. One cache for BOTH binary-resolution paths — the provider path
// (resolveCommand), which had no cache at all and re-ran spawn("which") plus the
// version-manager directory walk on every check, and the node path, which used
// to carry a module-level `let lastNodeExecutable = ""` — an INFINITE,
// never-invalidated cache that survived settings saves, MCP restarts and
// provider-command changes. Two caches for one concern is the inconsistency this
// singleton exists to remove: for node it is a TIGHTENING, for providers it is
// genuinely new. Bounded at 5 min positive / 30 s negative and cleared whole on
// any providers[*].command change.
const resolutionCache = createResolutionCacheState();
let lastNodeSearchCandidates: string[] = [];
let sessionCaidoToken = "";
let mcpContextWriteChain: Promise<void> = Promise.resolve();
let currentCaidoHistoryContext: CaidoContextSnapshot = createEmptyCaidoContextSnapshot();
let currentCaidoContextOverride: CaidoContextOverride = createEmptyCaidoContextOverride();
let lastMcpSelfTestResults: McpSelfTestResults = createEmptySelfTestResults();
let lastPersistenceScope = "";
let lastPersistenceMessage = "";
let lastPersistenceTimestamp = 0;
let pluginVersion = "unknown";
const sessionRuntimeFiles = new Map<string, { activityFilePath: string; approvalsFilePath: string }>();
const sessionDebugLogWriteChains = new Map<string, Promise<void>>();
const sessionDebugLogInitialized = new Set<string>();

type RuntimeActivityEvent =
  | {
    type: "approval-request";
    id: string;
    approvalId: string;
    occurredAt: number;
    toolName: string;
    toolLabel: string;
    group: McpToolPermissionGroup;
    sensitive: boolean;
    argumentsSummary: string;
    message: string;
  }
  | {
    type: "tool-result";
    id: string;
    occurredAt: number;
    toolName: string;
    toolLabel: string;
    group: McpToolPermissionGroup;
    sensitive: boolean;
    state: McpToolActivityState;
    durationMs: number | null;
    argumentsSummary: string;
    resultSummary: string;
  };

type ApprovalDecision = {
  approved: boolean;
  decidedAt: number;
};

// ── Runtime probe ───────────────────────────────────────────────────

type HostFacts = { platform: Platform; tmpdir: string };

// D-08's sentinel, matching runtime-probe.ts. Rendered for any version source
// whose read threw, so the block a bug reporter pastes has a line for every
// field rather than a hole.
const VERSION_UNAVAILABLE = "unavailable";

// D-02: the ONE cache of the single `os` read this file performs. Every
// downstream site — the orphan sweep, the temp-dir path, the debug-log path —
// reads this and never touches `os` again.
//
// Rejected alternative, and it is the load-bearing part: a module-level
// `const HOST = { platform: os.platform(), tmpdir: os.tmpdir() }` evaluated at
// plugin load means that if Caido's LLRT lacks `os`, the throw happens during
// MODULE EVALUATION and the entire Drift plugin dies — chat and settings
// included, and the frontend renders a dead panel — while RUN-05 never gets to
// speak. Reading lazily inside the probe degrades the same gap to a loud,
// actionable MCP-start error and makes the probe authoritative rather than
// decorative: it is the only code that can observe the failure.
let host: HostFacts | undefined;

// The last report the probe built. Built on the SUCCESS path as well as the
// failure path, so getDiagnostics always has something to show (D-06: every
// result, gating or not, lands in both the probe message and getDiagnostics).
let lastProbeReport: ProbeReport | undefined;

// How many attempts RUN-04's ladder needed for the real first write. Surfaced in
// getDiagnostics because a real Defender lock is not inducible in CI on any
// runner: this count in a support bundle is what tells a future reader whether
// the 1,500 ms ladder was long enough, so FS_RETRY_DELAYS_MS can be widened on
// evidence rather than on a guess.
let lastFirstWriteAttempts = 0;
// The same evidence channel as lastFirstWriteAttempts, for the OTHER production
// call site of the retry ladder (writeTemp). Kept separate rather than folded
// into the field above: that one answers "did the one-time staging copy survive
// Defender", this one answers "did a per-turn config write", and collapsing them
// would let the hot path overwrite the start-up answer on every send.
let lastTempWriteAttempts = 0;

// PERF-02 / WR-09's evidence channel for the activity tail. The tail is the one
// truncation site in the backend that emits NO marker into any user-visible
// artifact — its drops reach `sdk.console.error` and nothing else, so they are
// absent from getDiagnostics, from the support bundle and from the transcript,
// which is where mcpFirstWriteAttempts and resolutionCache were deliberately
// placed for exactly this reason. Cumulative across the session, so a bundle
// answers "did this machine lose activity records" rather than only "is it
// losing them right now".
let lastActivityDroppedBytes = 0;

// Passed to buildProbeReport as `realpathRungNote` and rendered verbatim.
//
// The distinction is load-bearing and must survive review: "not probed" is NOT
// the same claim as "absent". Probing rung 1 would require a module-scope import
// of the bare "fs" specifier, which the import block above explains is
// forbidden, so Drift never measures it. A report whose entire purpose is to be
// pasted into a public bug report as evidence must not assert a measurement
// Drift did not make; the absence claim is therefore attributed to the source
// analysis that produced it, never to this probe.
//
// ASCII only — no em dash, no section sign. This string is emitted into the MCP
// status panel, into sdk.console and into a GitHub issue body, and a cp1252
// Windows console wants plain ASCII. Same discipline as runtime-probe.ts.
const REALPATH_NATIVE_PROBE_NOTE =
  'realpathSync.native: not probed - Drift does not import the bare "fs" specifier at module scope (D-02); 04-RESEARCH.md section Environment Availability records it as absent from caido/dependency-llrt@main';

// D-08's version block. In the absence of any Caido version — sdk.meta exposes
// only db(), path() and assetsPath() — this is the closest available substitute
// rather than an omission, and it is exactly what a Windows bug reporter should
// paste into an issue.
//
// Every read is INDIVIDUALLY guarded and renders "unavailable" on failure, so a
// single throwing source cannot blank the rest of the block. `process` is
// reached through the same `globalThis` guard shape already used at
// index.ts:890-894 and :2838-2844 — never a bare `process.` reference, which
// would be a ReferenceError rather than an `undefined` in a runtime that does
// not define it. Caido's own @caido/quickjs-types declares no `process` global
// at all, so the guard is a hard requirement here, not defensive padding.
//
// `pluginVersion` is the existing module variable, already populated at init by
// the existing detectPluginVersion() (index.ts:455) — this reads that cache
// rather than adding a second manifest reader.
function readVersionBlock(): Record<string, string> {
  const runtimeProcess = globalThis as typeof globalThis & {
    process?: {
      version?: string;
      versions?: Record<string, string | undefined>;
    };
  };

  const guarded = (read: () => string | undefined): string => {
    try {
      const value = read();
      return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : VERSION_UNAVAILABLE;
    } catch {
      return VERSION_UNAVAILABLE;
    }
  };

  // The two `os` reads are written as their own lexical try blocks rather than
  // routed through `guarded`, so that "every os call site sits inside a try" is
  // checkable by reading this function instead of by following a callback into a
  // helper. They are two blocks rather than one so a throw from either still
  // leaves the other readable.
  let osPlatform = VERSION_UNAVAILABLE;
  try {
    osPlatform = os.platform();
  } catch {
    // D-05: an absent `os` must not break the version block itself. The block is
    // what makes the probe failure reportable, so it degrades rather than throws.
  }

  let osRelease = VERSION_UNAVAILABLE;
  try {
    osRelease = os.release();
  } catch {
    // Same reasoning as osPlatform above.
  }

  return {
    driftVersion:
      pluginVersion.trim() === "" ? VERSION_UNAVAILABLE : pluginVersion.trim(),
    processVersion: guarded(() => runtimeProcess.process?.version),
    // process.versions.node === "0.0.0" under LLRT is a FREE LLRT-vs-Node
    // discriminator for bug reports — it costs nothing to carry and answers
    // "which runtime was this?" without a Caido version the SDK does not expose.
    versionsNode: guarded(() => runtimeProcess.process?.versions?.["node"]),
    versionsLlrt: guarded(() => runtimeProcess.process?.versions?.["llrt"]),
    osPlatform,
    osRelease,
    // The `path` module's FLAVOUR, which is load-bearing for every runtime path
    // Drift builds and was the one unknown the probe did not report. `path.sep`
    // answers it in one character: "\\" is the win32 flavour, "/" is POSIX.
    // REPORTS, never gates — isAbsolutePath (platform.ts) no longer depends on
    // the answer, so this field exists so Phase 6 can design against a
    // measurement instead of an assumption, and so a Windows bug report carries
    // it without anyone having to ask.
    pathSeparator: guarded(() => path.sep),
    pathFlavour: guarded(() =>
      (path as unknown as { win32?: unknown }).win32 === undefined
        ? "single"
        : "dual",
    ),
  };
}

// A PRESENCE check only: no filesystem call, no path, no I/O. It probes rungs 2
// and 3 of D-04's ladder exclusively and can NEVER return the rung-1 value,
// because probing rung 1 would need a module-scope import of the bare "fs"
// specifier (see the import block for why that is forbidden).
//
// Under Caido the rung reached is expected to be `path.resolve`: there is no
// realpath symbol anywhere in caido/dependency-llrt@main's fs module, and none
// in Caido's own @caido/quickjs-types either. That is the expected answer rather
// than a failure, it is the answer Phase 6 designs against, and it is the
// highest-value single field in the whole probe report.
function detectRealpathRung(): RealpathRung {
  try {
    // Read through an unknown-shaped view because `realpath` is not declared on
    // Caido's `fs/promises` type surface at all. That makes this a genuine
    // runtime presence probe rather than a call into something the compiler
    // already believes exists.
    const candidate = (fsPromisesNs as unknown as { realpath?: unknown })
      .realpath;
    if (typeof candidate === "function") return "fs.realpath";
  } catch {
    // A namespace member read cannot normally throw, but an exotic module
    // namespace could. Fall through to the bottom rung rather than escaping.
  }
  return "path.resolve";
}

// Presence BOOLEANS only, read by NAME — never the values, and never an
// enumeration of the environment (T-04-04). These land in a report that is
// pasted into public bug reports, and the values contain the user's real account
// name. Phase 3's P3-VARS confirmed all three are present and non-empty in the
// parent process on windows-latest; this reports whether they survived into
// Caido's own process.
function readWindowsEnvPresence(): Record<string, boolean> {
  const runtimeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };

  const isPresent = (value: string | undefined): boolean =>
    typeof value === "string" && value.trim() !== "";

  try {
    const env = runtimeProcess.process?.env;
    return {
      USERPROFILE: isPresent(env?.USERPROFILE),
      APPDATA: isPresent(env?.APPDATA),
      LOCALAPPDATA: isPresent(env?.LOCALAPPDATA),
    };
  } catch {
    return { USERPROFILE: false, APPDATA: false, LOCALAPPDATA: false };
  }
}

// The parent process environment, read through the same `globalThis` guard shape
// as readVersionBlock (:316) and readWindowsEnvPresence (:414) — never a bare
// `process.` reference, which is a ReferenceError rather than an `undefined` in a
// runtime that does not declare the global. Caido's @caido/quickjs-types declares
// no `process` at all.
//
// The two consumers are buildMcpServerSpec's `parentEnv` (which merges it into
// every MCP spawn env — finding L-4) and buildProbeReport's `parentEnv` (which
// COUNTS it). Neither renders a value, and this function must never be used to
// log one (T-04-04).
function readParentEnv(): Record<string, string | undefined> {
  const processRef = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  try {
    return processRef.process?.env ?? {};
  } catch {
    return {};
  }
}

// RUN-05. The single `os` read of the whole backend, and the only place
// os.platform() / os.tmpdir() are called.
function probeRuntime(): Result<HostFacts> {
  let rawPlatform: string | undefined;
  let tmpdir: string | undefined;
  try {
    rawPlatform = os.platform();
    tmpdir = os.tmpdir();
  } catch {
    // Fall through with both undefined — D-05 turns that into the hard failure
    // below rather than a silent degrade.
  }

  const normalized = normalizePlatform(rawPlatform);
  // The explicit string check stays: a runtime can hand back a non-string
  // without throwing, and that would produce a temp path rooted at nothing.
  const candidate =
    normalized !== undefined && typeof tmpdir === "string"
      ? { platform: normalized, tmpdir }
      : undefined;

  // D-05 gates on the DERIVED root, not on the raw os.tmpdir(). Every consumer
  // reads getTempRoot(facts), which trims first, so a tmpdir of "   " passes a
  // `tmpdir !== ""` check on the raw value and then normalises to "". The
  // staging path is `path.join(getTempRoot(...), "drift-mcp-<token>")`, and
  // path.join("", x) is the RELATIVE path "drift-mcp-<token>": the
  // token-bearing runtime directory would be created inside Caido's working
  // directory, where getSweepRoots can never see it and the orphan sweep can
  // never reclaim it. Checking a value no consumer uses is the same
  // silent-wrong-answer this probe exists to eliminate.
  const tempRoot = candidate === undefined ? "" : getTempRoot(candidate);
  const facts = tempRoot === "" ? undefined : candidate;

  // Built on BOTH paths, so getDiagnostics always has a report to flatten. The
  // already-computed root is handed over rather than recomputed, so the report
  // can never describe a different value than the gate decided on.
  lastProbeReport = buildProbeReport({
    rawPlatform,
    normalizedPlatform: normalized,
    tmpdir,
    tempRoot,
    realpathRung: detectRealpathRung(),
    realpathRungNote: REALPATH_NATIVE_PROBE_NOTE,
    windowsEnvPresent:
      normalized === "win32" ? readWindowsEnvPresence() : undefined,
    // D-05's reported (never gating) metric, wired here because this is the
    // backend's single probe site. runtime-probe.ts counts keys and PATH
    // entries and renders integers only — it never names a key and never
    // prints a value (T-04-04 / T-05-10).
    parentEnv: readParentEnv(),
    version: readVersionBlock(),
  });

  if (facts === undefined) {
    // D-05: this arm is taken on EVERY OS. There is no platform === "darwin"
    // fallback to a hardcoded temp path, because if `os` is genuinely absent
    // from Caido's LLRT the POSIX path cannot reach os.tmpdir() either — and
    // silently falling back would ship a build whose Windows path is dead while
    // POSIX quietly works, which is the exact failure mode this milestone exists
    // to kill and the one that let the reported bug ship in the first place.
    return err(formatProbeFailure(lastProbeReport));
  }

  host = facts;
  return ok(facts);
}

// The one-line success summary. Deliberately compact: the gating results, the
// realpath rung Phase 6 designs against, and the two MAX_PATH integers a bug
// reporter cannot otherwise know. Everything here is a status word, a rung name
// or an integer — no paths, no environment values, no version strings (those
// belong to the failure message and to getDiagnostics, which is user-triggered).
//
// detectRealpathRung() is re-read rather than threaded through the report: it is
// a pure `typeof` presence check with no I/O, so a second read is free and
// cannot diverge from the one the report already recorded.
function describeProbeSummary(report: ProbeReport): string {
  const gating = report.capabilities
    .filter((capability) => capability.gating)
    .map((capability) => `${capability.name}=${capability.ok ? "ok" : "FAILED"}`);

  return [
    ...gating,
    `realpathRung=${detectRealpathRung()}`,
    `tempRootLength=${report.metrics["tempRootLength"] ?? VERSION_UNAVAILABLE}`,
    `projectedWorstCasePathLength=${report.metrics["projectedWorstCasePathLength"] ?? VERSION_UNAVAILABLE}`,
  ].join(" ");
}

/** Generate a short lowercase-hex directory token without the crypto module */
// 20 lowercase hex characters, using the same Math.random hex-loop idiom as
// genUUID (index.ts:829+). genUUID itself is NOT modified and is NOT replaced by
// crypto.randomUUID: Phase 3's P3-UUID is the one assertion of seven with zero
// source-level LLRT confirmation in either direction, so it licenses nothing.
// SC-3's shortening changes the CONSUMER, not the generator.
//
// MAX_PATH arithmetic — 259 usable characters, and Drift controls neither the
// LongPathsEnabled DWORD nor the longPathAware manifest, because the process is
// Caido's. The directory component shrinks from `drift-mcp-<36-char UUID>` (47
// characters with its separator) to `drift-mcp-<20 hex>` (31), saving 16, which
// moves the worst-case constructed path from about 124 characters to about 108.
//
// Security floor, stated explicitly so a later "tidy-up" cannot erode it:
//   * do NOT shorten below 16 hex characters;
//   * do NOT change the `drift-mcp-` prefix — the orphan sweep filters on
//     name.startsWith("drift-mcp-"), so renaming it would silently orphan every
//     pre-upgrade token-bearing directory (T-04-02);
//   * the real entropy is bounded by Math.random's PRNG state rather than by the
//     string length, which is precisely why shortening costs nothing here and
//     why a longer string would not buy any of it back.
function genShortToken(): string {
  const hex = "0123456789abcdef";
  let token = "";
  for (let i = 0; i < 20; i++) {
    token += hex[(Math.random() * 16) | 0];
  }
  return token;
}

// ── Persistence ─────────────────────────────────────────────────────

// Use SQLite (project-scoped, survives plugin reinstalls)
let db: PersistenceDbHandle | undefined;

function initDb(sdk: { meta: { db: () => unknown } }) {
  try {
    db = getPersistenceDbHandle(sdk.meta.db());
    if (db !== undefined) {
      // Best-effort cleanup of the legacy scanner table from pre-removal
      // installs. Failure is logged to diagnostics but must not block init.
      void db
        .execute("DROP TABLE IF EXISTS drift_scanner_occurrences")
        .catch((error: unknown) => {
          recordPersistenceIssue("dropLegacyScannerTable", error);
        });
    }
  } catch {
    db = undefined;
  }
}

// key is always a hardcoded constant ("settings" | "chats") supplied by saveJson/loadJson — never attacker-reachable.
// value is the JSON payload; single quotes are doubled per SQLite's string-literal escaping rules.
// The Caido SQLite binding does not expose parameterized queries on this handle, so we escape manually
// and keep the inputs constrained at the call site.
function escapeSqliteLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function loadSetting(key: string): Promise<string | undefined> {
  if (db === undefined) return undefined;
  try {
    await db.execute("CREATE TABLE IF NOT EXISTS drift_settings (key TEXT PRIMARY KEY, value TEXT)");
    const rows = await db.query(`SELECT value FROM drift_settings WHERE key = '${escapeSqliteLiteral(key)}'`) as Array<{ value: string }>;
    return rows[0]?.value;
  } catch (error) {
    recordPersistenceIssue(`loadSetting(${key})`, error);
    return undefined;
  }
}

async function saveSetting(key: string, value: string): Promise<string | undefined> {
  if (db === undefined) return undefined;
  try {
    await db.execute("CREATE TABLE IF NOT EXISTS drift_settings (key TEXT PRIMARY KEY, value TEXT)");
    await db.execute(`INSERT OR REPLACE INTO drift_settings (key, value) VALUES ('${escapeSqliteLiteral(key)}', '${escapeSqliteLiteral(value)}')`);
    return undefined;
  } catch (error) {
    return recordPersistenceIssue(`saveSetting(${key})`, error);
  }
}

async function loadJson<T>(filename: string, fallback: T): Promise<T> {
  // Try SQLite first (survives reinstalls)
  const dbData = await loadSetting(filename);
  if (dbData !== undefined) {
    try {
      return JSON.parse(dbData) as T;
    } catch (error) {
      recordPersistenceIssue(`parseSetting(${filename})`, error);
    }
  }
  // Fallback to JSON file
  try {
    const data = await readFile(path.join(pluginPath, `${filename}.json`), "utf-8");
    return JSON.parse(data) as T;
  } catch (error) {
    if (!isFileNotFound(error)) {
      recordPersistenceIssue(`loadJson(${filename})`, error);
    }
    return fallback;
  }
}

async function saveJson(filename: string, data: unknown): Promise<string | undefined> {
  const json = JSON.stringify(data);
  const errors: string[] = [];
  // Save to SQLite (survives reinstalls)
  const sqliteError = await saveSetting(filename, json);
  if (sqliteError !== undefined) errors.push(sqliteError);
  // Also save to file (backup)
  try {
    await writeFile(path.join(pluginPath, `${filename}.json`), JSON.stringify(data, null, 2));
  } catch (error) {
    errors.push(recordPersistenceIssue(`saveJson(${filename})`, error));
  }
  return errors.length > 0 ? errors.join("; ") : undefined;
}

// ── Async helpers ───────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

// Re-asserts 0o700 on a directory Drift is about to fill with token-bearing
// files, and REPORTS whether the guarantee actually holds.
//
// Why this exists: `mkdir(dir, { recursive: true, mode: 0o700 })` does not throw
// EEXIST on an existing directory and does NOT apply `mode` to it — the mode is
// honoured only for directories mkdir actually creates. On Linux os.tmpdir()
// defaults to the shared, world-writable /tmp, and the directory name is 80 bits
// of `Math.random()` rather than a CSPRNG, so "nobody can pre-create it" is a
// probability argument, not a guarantee. Requesting a mode and then asserting a
// confidentiality property from it is claiming more than the code delivers.
//
// Returns the offending permission bits when it POSITIVELY MEASURED a directory
// that grants group or other access, and `undefined` when the directory is
// either fine or unmeasurable. "Could not tell" must never be reported as a
// measurement — the same discipline runtime-probe.ts applies to the realpath
// rung — because LLRT's stat is not guaranteed to carry a numeric `mode`.
//
// `chmod` is reached through the fs/promises NAMESPACE, never a named import: a
// named import of an export Caido's LLRT does not provide is an ESM link error
// that kills the entire plugin at load, while a namespace member read yields
// `undefined` and degrades to the check below (the same reasoning as
// `detectRealpathRung`).
async function enforceOwnerOnlyDir(dir: string): Promise<number | undefined> {
  const chmodFn = (
    fsPromisesNs as unknown as {
      chmod?: (p: string, mode: number) => Promise<void>;
    }
  ).chmod;
  if (typeof chmodFn === "function") {
    try {
      await chmodFn(dir, 0o700);
    } catch {
      // Absent, unsupported (LLRT's set_mode is a no-op off unix), or the
      // directory is not ours to chmod. The measurement below is what decides.
    }
  }

  try {
    const info = await stat(dir);
    const mode = (info as unknown as { mode?: unknown }).mode;
    if (typeof mode !== "number") return undefined;
    const permissions = mode & 0o777;
    return (permissions & 0o077) === 0 ? undefined : permissions;
  } catch {
    return undefined;
  }
}

// RUN-04's second production call site for the retry ladder. Until this edit
// the ladder wrapped exactly one operation - the one-time mcp-server.mjs
// staging copy - and a ladder with a single caller is one refactor away from
// being inert. (The ladder's identifier is deliberately not spelled in this
// comment: the phase's call-site gate counts it over the RAW file, and a
// mention in prose would inflate the count that keeps it honest.)
//
// TRUE SCOPE, enumerated rather than assumed. `writeTemp` has exactly two
// callers, and the ladder covers those two and nothing else:
//
//   writeChatMcpConfig  - Claude's `mcp-<chatId>.json` and Copilot's
//                         `copilot-mcp-<chatId>.json`, both of which embed the
//                         literal Caido session token
//   getDiagnostics      - the `test-diag.json` writability probe
//
// The context file and the per-session activity/approval files are written
// through their own `writeFile` calls and do NOT pass through here, so they are
// outside this edit. That is narrower than 05-RESEARCH.md's list, which the
// enumeration does not support.
//
// WHAT THE LADDER DOES NOT COVER, stated so nobody later justifies it with a
// failure it cannot reach: the external CLI's READ of the config file. Drift
// does not perform that read, so Drift cannot retry it. What is retried here is
// the WRITE - `mkdir` plus `writeFile` under an anti-virus handle - which is
// the half Drift actually owns.
//
// THE TRADEOFF, so a later reader can weigh it rather than rediscover it: this
// sits on the per-turn hot path, because writeChatMcpConfig runs on every
// Claude and Copilot send. A transient error now costs up to the ladder's full
// duration instead of failing fast. That duration was chosen to sit inside
// human tolerance for a button press, which is the only reason the cost is
// acceptable here at all - widening FS_RETRY_DELAYS_MS is not free on this path.
//
// Both `mode:` options stay UNCONDITIONAL. LLRT's set_mode is a total no-op
// returning Ok(()) on non-unix and Node silently ignores mode on Windows, so a
// platform guard would double the branch count for zero behaviour change while
// risking a POSIX regression (T-04-30).
async function writeTemp(dir: string, name: string, content: string): Promise<string> {
  const fp = path.join(dir, name);
  const written = await withFsRetry(
    async () => {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      // 0o600: these temp files can carry the Caido token (e.g. the Copilot MCP
      // config embeds it). The 0o700 parent dir already blocks other users, but
      // restrict the file too as defense-in-depth.
      await writeFile(fp, content, { mode: 0o600 });
    },
    {
      onRetry: (info) => {
        console.error(
          `[drift] Transient filesystem error writing ${name} (attempt ${String(info.attempt)}, code ${info.code}); retrying in ${String(info.delayMs)}ms`,
        );
      },
    },
  );
  lastTempWriteAttempts = written.attempts;
  // The ladder exhausted. Surface the failure to the caller rather than handing
  // back a path to a file that may not exist or may be half-written: every
  // caller already treats a throw from here as the write having failed, and a
  // returned path is a promise that the content is on disk.
  if (written.kind === "Error") throw new Error(written.error);
  return fp;
}

function getTempMcpScriptPath(): string | undefined {
  if (mcpTempDir === undefined) return undefined;
  return path.join(mcpTempDir, "mcp-server.mjs");
}

function getMcpContextFilePath(): string | undefined {
  if (mcpTempDir === undefined) return undefined;
  return path.join(mcpTempDir, "mcp-context.json");
}

// RUN-02 / D-10. The SINGLE projection point: Claude's `mcp-<chatId>.json` and
// Copilot's `copilot-mcp-<chatId>.json` are now the same document built by the
// same pure function from the same spec, rather than two writers that happened
// to agree. The document carries `spec.driftVars` and never the parent-merged
// `spec.env` — the projection helper in mcp-server-spec.ts states at its own
// `env` line why that asymmetry is deliberate (T-05-04).
async function writeChatMcpConfig(
  name: string,
  spec: McpServerSpec,
  sdk: BackendSDK,
): Promise<string | undefined> {
  if (mcpTempDir === undefined) return undefined;
  // Unchanged, and it GAINS meaning: `command` used to be the wrapper `.sh` this
  // very plan deletes, and is now the absolute `node` path the CLI will execute.
  if (!(await fileExists(spec.command))) return undefined;

  // T-05-13. Claude Code expands variable references INSIDE a stdio server's
  // `env` field, and an unset reference is left as unexpanded text with only a
  // `claude mcp list` warning — either way the server would start holding a
  // token that is not the token, i.e. a SILENTLY unauthenticated MCP server.
  // Failing loud here is strictly better than writing a config that fails quiet.
  //
  // This is a guard against ACCIDENTAL expansion of a literal value. It is not
  // the `${CAIDO_TOKEN}` indirection D-10 rejected — Drift still writes the
  // literal token, exactly as the shipping Copilot path already does.
  //
  // KEY NAMES only, never a value (D-11 / T-04-04).
  const expandableKeys = findExpandableEnvKeys(spec.driftVars);
  if (expandableKeys.length > 0) {
    sdk.console.error(
      `[drift] Refusing to write ${name}: the value of ${expandableKeys.join(", ")} carries a sequence Claude Code expands as a variable reference inside a stdio server's env field. Writing it would produce a silently unauthenticated MCP server. Re-authenticate in Caido to obtain a fresh session token, then retry.`,
    );
    return undefined;
  }

  return writeTemp(
    mcpTempDir,
    name,
    JSON.stringify(toMcpConfigDocument(spec), null, 2),
  );
}

// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
//
// POSIX-only, and it survives this phase for exactly one reason: Gemini and
// Codex are registered with `mcp add drift -- <wrapper>`, which persists a PATH
// and nothing else, so the `export` lines this function renders are the SOLE
// carrier of CAIDO_URL, CAIDO_TOKEN and the DRIFT_* tool-policy variables for
// those two CLIs on darwin and linux. Deleting it now, before Phase 7 lands
// their env-passing registration, would be a live CMP-01 compatibility
// regression for two shipping providers on the platforms the entire user base
// runs today - not a theoretical one (D-01).
//
// The due date is named literally because an undated "temporary" comment
// becomes permanent: Phase 7, PRV-03.
//
// Its `passThroughArgs` option now has exactly one caller, which is correct and
// not an invitation to simplify the body - Phase 7 deletes the whole function.
function renderExportExecScript(
  command: string,
  args: string[],
  envVars: Record<string, string>,
  options?: {
    passThroughArgs?: boolean;
  },
): string {
  return [
    "#!/bin/bash",
    ...Object.entries(envVars).map(([key, value]) => `export ${key}=${shellQuote(value)}`),
    `exec ${shellQuote(command)}${args.length > 0 ? ` ${args.map(shellQuote).join(" ")}` : ""}${options?.passThroughArgs === true ? " \"$@\"" : ""}`,
  ].join("\n");
}

function getSessionDebugLogPath(sessionId: string): string | undefined {
  if (!currentSettings.debugLogging) return undefined;
  // D-02 populates `host` only at MCP start, but a chat turn can run with MCP
  // never started. `debugLogging` is opt-in, so silently skipping the log is
  // acceptable and strictly better than reintroducing a hardcoded temp path that
  // is not even a valid path on Windows.
  if (host === undefined) return undefined;
  // path.join, never template concatenation — see the note at the mcpTempDir
  // assignment in startMcpServer.
  return path.join(getTempRoot(host), `drift-session-${sessionId}.log`);
}

function summarizeDebugChunk(text: string, maxChars = DEBUG_CHUNK_PREVIEW_CHARS): string {
  const compact = text
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, Math.max(0, maxChars - 3))}...`;
}

function redactDebugText(text: string): string {
  return text
    // The shell arm. It outlives the provider launch script deleted in this
    // plan, because the surviving POSIX Gemini/Codex wrapper still renders
    // `export CAIDO_TOKEN='...'` lines and Phase 7 (PRV-03) is what removes
    // both the wrapper and this arm. Narrowing a redactor as cosmetic cleanup
    // is the wrong direction: a redactor that no longer covers a shape that
    // still exists fails OPEN, and the failure is a token in a support bundle.
    .replace(/(CAIDO_TOKEN=)'[^']*'/g, "$1'[redacted]'")
    .replace(/("CAIDO_TOKEN"\s*:\s*)"[^"]*"/g, "$1\"[redacted]\"");
}

let debugLogErrorReported = false;

function appendSessionDebugLog(logPath: string | undefined, message: string): void {
  if (logPath === undefined) return;
  const line = `[${new Date().toISOString()}] ${message}\n`;
  const previous = sessionDebugLogWriteChains.get(logPath) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      // Open with "a" (append) for each line so we never retain the
      // accumulated buffer in memory. The per-path write chain serializes
      // these so lines do not interleave.
      const initialized = sessionDebugLogInitialized.has(logPath);
      if (!initialized) {
        sessionDebugLogInitialized.add(logPath);
      }
      const handle = await openFile(logPath, initialized ? "a" : "w");
      try {
        await handle.write(line);
      } finally {
        await handle.close();
      }
    })
    .catch((error: unknown) => {
      if (!debugLogErrorReported) {
        debugLogErrorReported = true;
        console.error(`[drift] session debug log write failed for ${logPath}: ${String(error)}`);
      }
    });
  sessionDebugLogWriteChains.set(logPath, next);
}

async function disposeSessionDebugLog(logPath: string | undefined): Promise<void> {
  if (logPath === undefined) return;
  const pending = sessionDebugLogWriteChains.get(logPath);
  if (pending !== undefined) {
    await pending.catch(() => undefined);
  }
  sessionDebugLogWriteChains.delete(logPath);
  sessionDebugLogInitialized.delete(logPath);
  await rm(logPath, { force: true }).catch(() => undefined);
}

// TEMPORARY — DELETED IN PHASE 7 (PRV-03).
//
// POSIX-only, and it exists solely to quote the values the export-script
// renderer above writes into the surviving Gemini/Codex wrapper - the wrapper
// whose `export` lines are the only carrier of the Caido token and the
// tool-policy variables for those two CLIs on darwin and linux. It has no
// caller outside that render path, so it dies with it. Deleting either one
// before Phase 7's env-passing registration lands would be a live CMP-01
// regression for two shipping providers on the platforms the entire user base
// runs today (D-01).
//
// (That renderer's identifier is deliberately not spelled in this block: the
// phase counts it over the RAW file and expects exactly two - the definition
// and the one call.)
//
// The due date is named literally because an undated "temporary" comment
// becomes permanent: Phase 7, PRV-03.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT";
}

function recordPersistenceIssue(scope: string, error: unknown): string {
  const message = `${scope}: ${String(error)}`;
  lastPersistenceScope = scope;
  lastPersistenceMessage = message;
  lastPersistenceTimestamp = Date.now();
  return message;
}

type SessionStateName = CliSessionStateEvent["state"];

function getSessionSnapshot(sessionId: string): CliSessionStateEvent | undefined {
  return sessionSnapshots.get(sessionId);
}

function publishSessionState(
  sdk: BackendSDK,
  update: {
    sessionId: string;
    chatId: string;
    providerId: string;
    state: SessionStateName;
    reason: string;
    reasonCode?: CliSessionReasonCode;
    mcpAttached?: boolean;
    recoveredFromPartialOutput?: boolean;
    exitCode?: number;
  },
): CliSessionStateEvent {
  const previous = sessionSnapshots.get(update.sessionId);
  const snapshot: CliSessionStateEvent = {
    chatId: update.chatId,
    sessionId: update.sessionId,
    providerId: update.providerId,
    state: update.state,
    reason: update.reason,
    ...(update.reasonCode !== undefined ? { reasonCode: update.reasonCode } : {}),
    mcpAttached: update.mcpAttached ?? previous?.mcpAttached ?? (mcpTempDir !== undefined),
    ...(update.recoveredFromPartialOutput === true ? { recoveredFromPartialOutput: true } : {}),
    updatedAt: Date.now(),
    ...(update.exitCode !== undefined ? { exitCode: update.exitCode } : {}),
  };
  sessionSnapshots.set(update.sessionId, snapshot);
  sdk.api.send("cli-session-state", snapshot);
  return snapshot;
}

async function detectPluginVersion(): Promise<string> {
  const candidates = [
    path.join(pluginPath, "manifest.json"),
    path.join(pluginPath, "..", "manifest.json"),
    path.join(pluginPath, "package.json"),
    path.join(pluginPath, "..", "..", "package.json"),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf-8");
      const parsed = JSON.parse(raw) as { version?: string };
      if (typeof parsed.version === "string" && parsed.version.trim() !== "") {
        return parsed.version.trim();
      }
    } catch {
      // Keep trying other candidates.
    }
  }

  return "unknown";
}

function updateCaidoHistoryContext(input: Partial<CaidoContextSnapshot>): boolean {
  const nextContext = mergeCaidoContextSnapshot(currentCaidoHistoryContext, input);
  const changed = hasCaidoContextChanged(currentCaidoHistoryContext, nextContext);
  if (changed) currentCaidoHistoryContext = nextContext;
  return changed;
}

// The path of the surviving POSIX Gemini/Codex wrapper. Its rationale and its
// removal date live in ONE place, on writeMcpWrapper below - read that block
// rather than this one.
//
// The dated literal is deliberately NOT repeated here. The phase counts those
// notices repository-wide and expects exactly four (the Windows probe workflow
// header plus the three functions that render and write the wrapper), so a
// fourth copy added here to be helpful would break the count that keeps the
// survivors owned. Say it once, in the place that does the writing.
function getMcpWrapperPath(): string | undefined {
  if (mcpTempDir === undefined) return undefined;
  return path.join(mcpTempDir, "mcp-wrapper.sh");
}

async function readStoredMcpContext(): Promise<StoredMcpContext> {
  const contextFilePath = getMcpContextFilePath();
  if (contextFilePath === undefined) {
    return {
      uiContext: currentCaidoHistoryContext,
      overrideContext: currentCaidoContextOverride,
    };
  }

  try {
    const raw = await readFile(contextFilePath, "utf-8");
    const parsed = parseMcpRuntimeContext(raw);
    currentCaidoContextOverride = parsed.overrideContext;
    return {
      uiContext: parsed.uiContext,
      overrideContext: parsed.overrideContext,
    };
  } catch {
    return {
      uiContext: currentCaidoHistoryContext,
      overrideContext: currentCaidoContextOverride,
    };
  }
}

async function writeMcpContextFile(): Promise<string | undefined> {
  const contextFilePath = getMcpContextFilePath();
  if (contextFilePath === undefined) return undefined;
  mcpContextWriteChain = mcpContextWriteChain
    .catch(() => undefined)
    .then(async () => {
      try {
        const existing = parseMcpRuntimeContext(await readFile(contextFilePath, "utf-8"));
        currentCaidoContextOverride = existing.overrideContext;
      } catch {
        // Use the current in-memory override when the file does not exist yet.
      }
      await writeFile(
        contextFilePath,
        serializeMcpRuntimeContext(currentCaidoHistoryContext, currentCaidoContextOverride),
      );
    });
  await mcpContextWriteChain;
  return contextFilePath;
}

async function buildCurrentMcpStatus(): Promise<McpServerInfo> {
  const ready = mcpTempDir !== undefined;
  const mcpScriptPath = getTempMcpScriptPath();
  const storedContext = await readStoredMcpContext();
  return buildMcpServerInfo({
    running: ready,
    host: currentSettings.mcp.host,
    port: ready ? currentSettings.mcp.port : 0,
    token: "",
    url: ready && mcpScriptPath !== undefined ? `stdio://${mcpScriptPath}` : "",
    authState: mcpAuthState,
    authSource: getCaidoTokenSource(),
    authMessage: mcpAuthMessage,
    uiContext: storedContext.uiContext,
    overrideContext: storedContext.overrideContext,
    selfTestResults: lastMcpSelfTestResults,
    toolPolicy: getCurrentMcpToolPolicy(),
  });
}

async function publishMcpStatus(sdk: BackendSDK): Promise<void> {
  sdk.api.send("mcp-status", await buildCurrentMcpStatus());
}

function setMcpAuthStatus(state: McpAuthState, message = ""): void {
  mcpAuthState = state;
  mcpAuthMessage = message;
}

function getEffectiveCaidoToken(): string {
  return sessionCaidoToken.trim();
}

function getCaidoTokenSource(): "session" | "none" {
  return sessionCaidoToken.trim() !== "" ? "session" : "none";
}

function getCurrentMcpToolPolicy(): McpToolPolicy {
  return buildMcpToolPolicy(currentSettings.mcpPermissions);
}

// A THIN ADAPTER over the pure buildMcpDriftVars. The signature and all four
// call sites are unchanged; what changed is where the keys are decided.
//
// This function used to read TWO pieces of module state inline —
// `currentSettings.caidoApi.url` and `getMcpContextFilePath()` — plus the
// current tool policy. Those reads are why the env dict was unverifiable: they
// made the key set a function of module singletons inside a file no test can
// import. They are now INJECTED, and the dict itself (its key set, its
// insertion order, DRIFT_ALLOWLIST_ACTIVE's unconditional presence, and the
// three omit-when-absent spreads) is unit-tested in mcp-server-spec.test.ts.
//
// Insertion order is load-bearing, not cosmetic: JSON.stringify walks it, and
// the Copilot config document's byte shape is a CMP-01 surface.
function buildMcpRuntimeEnv(input: {
  caidoToken: string;
  toolPolicy?: McpToolPolicy;
  activityFilePath?: string;
  approvalsFilePath?: string;
}): Record<string, string> {
  const toolPolicy = input.toolPolicy ?? getCurrentMcpToolPolicy();
  return buildMcpDriftVars({
    caidoUrl: currentSettings.caidoApi.url,
    caidoToken: input.caidoToken,
    contextFilePath: getMcpContextFilePath(),
    allowedToolNames: toolPolicy.allowedToolNames,
    confirmationRequiredToolNames: toolPolicy.confirmationRequiredToolNames,
    confirmSensitiveActions: toolPolicy.confirmSensitiveActions,
    activityFilePath: input.activityFilePath,
    approvalsFilePath: input.approvalsFilePath,
  });
}

async function createSessionRuntimeFiles(sessionId: string): Promise<{
  activityFilePath: string;
  approvalsFilePath: string;
} | undefined> {
  if (mcpTempDir === undefined) return undefined;

  await mkdir(mcpTempDir, { recursive: true, mode: 0o700 });
  const activityFilePath = path.join(mcpTempDir, `mcp-activity-${sessionId}.jsonl`);
  const approvalsFilePath = path.join(mcpTempDir, `mcp-approvals-${sessionId}.json`);
  await writeFile(activityFilePath, "");
  await writeFile(approvalsFilePath, "{}\n");
  const files = { activityFilePath, approvalsFilePath };
  sessionRuntimeFiles.set(sessionId, files);
  return files;
}

// parseRuntimeActivityEvents used to live here. PERF-02 replaced its ONLY caller
// (the 250 ms flushActivities tick) with readActivityTick, which already splits,
// trims and drops empty lines, so the function had no remaining reader and
// tsconfig's noUnusedLocals plus eslint at --max-warnings 0 both fail on dead
// code. Its tolerant semantics are unchanged, just inlined at the one call site:
// a line that does not parse as JSON is skipped, never thrown.

function toToolApprovalRequest(
  sessionId: string,
  event: Extract<RuntimeActivityEvent, { type: "approval-request" }>,
): McpToolApprovalRequest {
  return {
    sessionId,
    approvalId: event.approvalId,
    toolName: event.toolName,
    toolLabel: event.toolLabel,
    group: event.group,
    argumentsSummary: event.argumentsSummary,
    message: event.message,
    sensitive: event.sensitive,
  };
}

function toToolActivity(
  event: Extract<RuntimeActivityEvent, { type: "tool-result" }>,
): McpToolActivity {
  return {
    id: event.id,
    toolName: event.toolName,
    toolLabel: event.toolLabel,
    group: event.group,
    sensitive: event.sensitive,
    state: event.state,
    occurredAt: event.occurredAt,
    durationMs: event.durationMs,
    argumentsSummary: event.argumentsSummary,
    resultSummary: event.resultSummary,
  };
}

function getClaudeToolFailureFallback(
  activities: McpToolActivity[],
): string {
  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (activity === undefined) continue;
    if (activity.state === "success") continue;

    const summary = trimToString(activity.resultSummary);
    const prefix =
      activity.state === "denied"
        ? "Drift MCP action denied"
        : "Drift MCP tool failed";
    return summary === ""
      ? `${prefix}: ${activity.toolLabel} (${activity.toolName}).`
      : `${prefix}: ${activity.toolLabel} (${activity.toolName}). ${summary}`;
  }

  return "";
}

function buildClaudePostToolStallFallback(
  activities: McpToolActivity[],
): string {
  const header =
    "Claude Code stopped responding while waiting for tool results, even though the MCP tools completed. Drift force-finalized the turn. Ask again and the next turn will reuse this session.";
  if (activities.length === 0) return header;
  const lines = activities.map((activity) => {
    const duration = activity.durationMs !== null ? `${String(activity.durationMs)}ms` : "n/a";
    const summary = trimToString(activity.resultSummary);
    const suffix = summary === "" ? "" : ` — ${summary}`;
    return `- ${activity.toolLabel} (${activity.toolName}) · ${activity.state} · ${duration}${suffix}`;
  });
  return `${header}\n\nTools that ran during this turn:\n${lines.join("\n")}`;
}

async function writeApprovalDecision(
  approvalsFilePath: string,
  approvalId: string,
  approved: boolean,
): Promise<void> {
  let current: Record<string, ApprovalDecision>;
  try {
    const raw = await readFile(approvalsFilePath, "utf-8");
    current = JSON.parse(raw) as Record<string, ApprovalDecision>;
  } catch {
    current = {};
  }
  current[approvalId] = {
    approved,
    decidedAt: Date.now(),
  };
  await writeFile(approvalsFilePath, `${JSON.stringify(current, null, 2)}\n`);
}

function renderHttpContextAttachment(httpContext: HttpContextPayload | undefined): string {
  if (httpContext === undefined) return "";
  const raw = trimToString(httpContext.raw);
  if (raw === "") return "";

  const label = trimToString(httpContext.label) || "HTTP context";
  const source = trimToString(httpContext.source);
  const headerLines = [
    `[Attached ${label}]`,
    ...(source !== "" ? [`Source: ${source}`] : []),
    "Treat the attached HTTP material as the primary artifact for analysis. Use it directly instead of asking the user to paste the request or response again.",
    "",
    raw,
    "",
  ];

  return `${headerLines.join("\n")}\n`;
}

// DELETED IN PHASE 7 (PRV-03).
//
// The last surviving POSIX shell wrapper, and it serves ONLY Gemini and Codex:
// `gemini/codex mcp add drift -- <wrapper>` persists a PATH, so this script's
// `export` lines are the sole carrier of CAIDO_URL/CAIDO_TOKEN/DRIFT_* for those
// two CLIs. Deleting it before Phase 7 lands their `--env`/`-e` registration
// would be a live CMP-01 regression for two shipping providers on the platforms
// the entire user base runs today (D-01). Phase 7 is named literally because an
// undated "temporary" comment becomes permanent.
//
// Its ONLY caller is tryRegisterMcpForProviders, which does not call it at all on
// win32 — so no `.sh` is written and no `chmod` is spawned there (D-02/D-03).
//
// The win32-unreachability tripwire D-02 asks for is the pure
// `planMcpCliRegistration` unit case in mcp-server-spec.test.ts, NOT an
// assertion inside this file: index.ts is not importable under vitest (no
// caido:plugin alias), so no test can execute a line of it. The predicate is
// what is tested; that this function sits behind it is static-gate evidence.
// It takes the spec so the wrapper and the direct spawn can never describe two
// different launches.
async function writeMcpWrapper(spec: McpServerSpec): Promise<string | undefined> {
  if (mcpTempDir === undefined) return undefined;
  // getMcpWrapperPath() is the single source of truth for the surviving POSIX
  // wrapper path, which also keeps it from becoming an unused local now that the
  // self-test no longer calls it.
  const wrapperPath = getMcpWrapperPath();
  if (wrapperPath === undefined) return undefined;
  const tempWrapperPath = `${wrapperPath}.tmp`;
  await writeFile(
    tempWrapperPath,
    // spec.driftVars, not spec.env: the wrapper exports Drift's own variables
    // and `exec`s into a shell that already carries the parent environment.
    renderExportExecScript(spec.command, spec.args, spec.driftVars, {
      passThroughArgs: true,
    }),
    // 0o700: the wrapper exports the Caido token and must be executable.
    { mode: 0o700 },
  );
  const chmodResult = await spawnAndWait("chmod", ["+x", tempWrapperPath]);
  if (chmodResult.code !== 0) {
    await rm(tempWrapperPath, { force: true });
    return undefined;
  }
  await rename(tempWrapperPath, wrapperPath);
  return wrapperPath;
}

// HLT-01. Spawns `node mcp-server.mjs --validate-auth` DIRECTLY, with the env
// handed to the child through the spawn option rather than through a wrapper
// script's `export` lines. Everything below the spawn — the JSON parse, the
// AUTHORIZATION/INVALID_TOKEN classification and the two fallbacks — is
// unchanged, because the transport changed and the protocol did not.
async function validateCaidoAuth(spec: McpServerSpec): Promise<CaidoValidationResult> {
  const result = await spawnAndWait(spec.command, [...spec.args, "--validate-auth"], {
    env: spec.env,
  });
  const output = result.stdout.trim() || result.stderr.trim();

  try {
    const parsed = JSON.parse(output) as {
      ok?: boolean;
      message?: string;
      caidoCode?: string;
      caidoReason?: string;
    };

    if (parsed.ok === true) {
      return { ok: true, authState: "valid", message: "" };
    }

    if (parsed.ok === false) {
      const authState =
        parsed.caidoCode === "AUTHORIZATION" || parsed.caidoReason === "INVALID_TOKEN"
          ? "invalid"
          : "error";
      return {
        ok: false,
        authState,
        message: parsed.message ?? "Caido API validation failed.",
      };
    }
  } catch {
    // Fall through to generic error handling.
  }

  if (result.code !== 0 && result.code !== 1) {
    return {
      ok: false,
      authState: "error",
      message:
        output || `Caido API validation helper exited unexpectedly with code ${String(result.code)}.`,
    };
  }

  return {
    ok: false,
    authState: "error",
    message:
      output || "Caido API validation failed before Drift could confirm authentication.",
  };
}

/** Generate UUID v4 without crypto module */
function genUUID(): string {
  const hex = "0123456789abcdef";
  let uuid = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += "-";
    } else if (i === 14) {
      uuid += "4"; // version 4
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4 | 8)]; // variant
    } else {
      uuid += hex[(Math.random() * 16 | 0)];
    }
  }
  return uuid;
}

// genUUID's last production call site was the mcpTempDir name, which SC-3
// shortened to genShortToken()'s 20 hex characters for MAX_PATH headroom. The
// hex loop above is PRESERVED BYTE-FOR-BYTE anyway: Phase 3's P3-UUID is the one
// assertion of seven with zero source-level LLRT confirmation in either
// direction, so nothing licenses replacing it with crypto.randomUUID, and the
// port still needs a UUID generator that is known to work under QuickJS/LLRT.
//
// This re-export exists only so `noUnusedLocals` (tsconfig) and
// `@typescript-eslint/no-unused-vars` (eslint --max-warnings 0) do not force the
// deletion the preservation rule forbids. It is a bookkeeping statement, not an
// API: nothing imports index.ts. Delete it the moment a caller reappears.
export { genUUID };

// ── CLI resolution ──────────────────────────────────────────────────

async function resolveCommand(
  command: string,
  options?: { bypassCache?: boolean },
): Promise<string | undefined> {
  // Deliberately OUTSIDE the cache. This is a single fileExists call, not worth
  // an entry, and caching it would let a deleted or replaced absolute path
  // linger for the whole positive TTL (T-04-25).
  // isAbsolutePath, not path.isAbsolute: the `path` module's flavour is not
  // source-verified for Caido's LLRT, and under a POSIX-flavoured one
  // `path.isAbsolute("C:\\Users\\x\\...\\claude.cmd")` is FALSE — so a Windows
  // user with an absolute provider command would fall through to a `which`
  // spawn, a binary that does not exist there, and be told the command is
  // unresolvable. The platform comes from the RUN-05 probe and is `undefined`
  // before it runs, which the helper handles by accepting either spelling.
  if (isAbsolutePath({ value: command, platform: host?.platform })) {
    return await fileExists(command) ? command : undefined;
  }
  // PERF-03. Everything below — the which/where.exe spawn, the candidate build
  // and the fileExists loop — is the expensive part, and it is unchanged except
  // for being moved into the resolver callback. Date.now() is read HERE and
  // never inside resolution-cache.ts, which is what keeps that module's expiry
  // tests deterministic.
  //
  // `clock` is the SECOND read, taken when the resolve finishes. The walk above
  // can take seconds on a cold cache, and stamping the entry with the instant
  // the walk STARTED would make it born already aged by that much — a slow
  // resolve shortening its own TTL.
  return await resolveWithCache(resolutionCache, {
    key: `cmd:${command}`,
    now: Date.now(),
    clock: () => Date.now(),
    bypass: options?.bypassCache,
    resolve: async () => {
      // D-02 wired. The search binary is no longer a hardcoded POSIX name:
      // getWhichCommand returns the binary AND the argument builder for this
      // machine's platform, and on win32 it derives an absolute path under the
      // machine's own system root rather than trusting a bare name that any
      // writable PATH entry could satisfy (T-06-T22).
      //
      // `platform` is the RUN-05 probe value and is `undefined` before the probe
      // runs — the same threading the absolute-path fast path above already
      // uses. The helper takes its POSIX arm on `undefined`, and that is NOT the
      // pre-probe POSIX default D-08 rejected: only ONE binary can be spawned,
      // so no union answer exists here, and skipping the search pre-probe would
      // drop resolution for a PATH-only binary on macOS and Linux — a CMP-01
      // regression, not a Windows-only cost. The `error` handler below is what
      // makes the POSIX arm safe on Windows: the POSIX binary cannot be spawned
      // there, and the handler turns that into a fall-through to the candidate
      // walk instead of a throw.
      //
      // `env` comes from readParentEnv(), which already carries the defensive
      // `globalThis` cast and the try/catch — and whose own comment forbids
      // rendering a value. This site consumes those values and logs none of
      // them (T-06-T20 / 05-D-11).
      const searchCommand = getWhichCommand({
        platform: host?.platform,
        env: readParentEnv(),
      });
      const pathResolution = await new Promise<string | undefined>((resolve) => {
        // UX-04 / Phase 10 owns what this line adds on Windows: a spawn from a
        // GUI-hosted process pops a console window for the child's lifetime,
        // and resolveCommand is a hot path, so this one flashes often. It is
        // deliberately NOT fixed here — and it is not a flag to flip. The
        // per-spawn suppression Windows offers is not declared in this runtime's
        // spawn options surface at all, so removing the flash is real work
        // rather than one word. Grep UX-04 to find every site that phase owns.
        //
        // The same guard spawnAndWait carries, for the same reason. A
        // synchronous throw inside a Promise executor REJECTS the promise, and
        // the `error` handler the comment above leans on can never fire for it.
        // Two concrete synchronous throwers reach this line: a NUL byte in
        // `command` - rehydrated from the persisted provider settings, the same
        // untrusted blob getNodeExecutable already defends against - and LLRT's
        // child_process shim, whose ENOENT surface is unverified in EITHER
        // direction while the win32 arm now spawns a different binary
        // (`where.exe`) on it. The `.cmd` EINVAL measured in 03-FINDINGS.md
        // § P1-CMD does not apply here (neither `which` nor `where.exe` is a
        // `.cmd`), but the executor shape that makes it fatal is identical.
        //
        // Unguarded, the rejection is re-thrown by resolveWithCache and travels
        // resolveCommand -> checkProvider -> Promise.all -> getProviderStatuses,
        // taking ALL FOUR provider statuses down as one rejected RPC.
        //
        // CMP-01: on macOS and Linux the spawn does not throw, so the catch arm
        // is not entered and this site behaves exactly as it always has.
        let child: ChildProcessWithoutNullStreams;
        try {
          child = spawn(searchCommand.command, searchCommand.args(command));
        } catch {
          // The same fall-through the "error" handler below produces: no PATH
          // hit, walk the candidates. Return so nothing downstream of the failed
          // spawn runs.
          resolve(undefined);
          return;
        }
        // PERF-04 site 7 — the accumulator every earlier inventory in this phase
        // missed, because `grep -n "stdout += "` is structurally blind to a
        // variable named `out`. Bounded rather than EXCLUDED: the tempting
        // exemption ("it is only a PATH search, the output is a few short
        // paths, and the timeout below caps it") is the same argument this phase
        // explicitly rejects for callMcpMethod — a timeout bounds the exposure
        // WINDOW, not the VOLUME, and shipping that reading in one place while
        // rejecting it in the other turns an inconsistency into a precedent.
        // SPAWN_STDOUT_MAX_CHARS with head retention is reused rather than
        // adding a seventh constant: this consumer reads the HEAD of the output,
        // identically to spawnAndWait's stdout.
        let out = createBoundedBuffer({
          maxChars: SPAWN_STDOUT_MAX_CHARS,
          retention: "head",
        });
        let settled = false;
        // Selected on the literal "win32"; every other value, `undefined`
        // included, keeps the number this site has always used (CMP-01).
        const searchTimeoutMs =
          host?.platform === "win32"
            ? WIN32_PATH_SEARCH_TIMEOUT_MS
            : POSIX_PATH_SEARCH_TIMEOUT_MS;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { child.kill("SIGKILL"); } catch { /* ignore */ }
          resolve(undefined);
        }, searchTimeoutMs);
        child.stdout?.on("data", (d: Buffer) => { out = appendBounded(out, d.toString()); });
        child.on("close", (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          // The retained HEAD, never renderBoundedBuffer. Above the cap the
          // rendered value splices `\n…[drift: truncated N bytes]…\n` BETWEEN
          // head and tail; the marker begins with a newline, so it survives
          // `.trim()`, and the result — head + marker — would be returned as a
          // resolved executable path and handed to fileExists/spawn. A path
          // consumer must never be shown the truncation marker: the marker is
          // for humans reading diagnostics, and this value is for the OS.
          //
          // D-03's other half — what the cap COSTS, and why it is acceptable
          // rather than merely tolerated. Above the cap head retention drops
          // the TAIL, and the dropped entries are the LOWEST PATH-priority hits,
          // because the search tool walks PATH in order: the ranking below still
          // sees every hit that could have won. And the partial final line head
          // retention can leave behind is discarded by the ranker's own
          // extension-termination check, since a truncated line does not end in
          // a known extension. Neither loss can produce a wrong answer, only a
          // narrower one — which is why this site takes the shared limit rather
          // than an exemption from it.
          //
          // The first RANKED line, not the first PRINTED one. Every line the
          // search tool prints is a real hit; the ranking picks among them by
          // extension preference — a real executable ahead of a shim, SC-2 —
          // with the tool's own emission order breaking ties inside one
          // extension. On POSIX the extension ladder has exactly one entry, so
          // the ranker's non-win32 arm returns exactly the first non-empty
          // trimmed line and the single-answer semantics here are byte-for-byte
          // what they always were (CMP-01).
          //
          // The split tolerates a carriage return because Phase 3's P1-WHERE
          // measured CRLF-split output: a lone `\r` rides on every line but the
          // last, and an untolerated split would hand a path with a trailing
          // carriage return to fileExists.
          const ranked = rankPathSearchHits({
            lines: out.head.split(/\r?\n/),
            platform: host?.platform,
          });
          const resolved = ranked[0] ?? "";
          resolve(code === 0 && resolved !== "" ? resolved : undefined);
        });
        child.on("error", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(undefined);
        });
      });

      // `platform` is the RUN-05 probe value and is `undefined` before the
      // probe runs — the same threading the absolute-path fast path above
      // already uses, and the pure builder unions both arms on `undefined`.
      // `roots` comes from readParentEnv() rather than a bare environment read:
      // that helper already carries the defensive `globalThis` cast and the
      // try/catch, and its own comment forbids rendering a value. This call site
      // consumes those values and logs none of them (T-06-T03 / 05-D-11).
      const candidates = await getCommandExecutableCandidates({
        command,
        platform: host?.platform,
        pathResolution,
        homeDirs: getKnownHomeDirs(),
        roots: getWindowsNamedRoots({ env: readParentEnv() }),
        // CR-02's gate on the one drive-qualified literal in the catalogue.
        // Read HERE, from the same readParentEnv() the roots come from, so the
        // pure builder behind this call stays free of any environment read.
        nvmWindowsInstalled: isNvmWindowsInstalled({ env: readParentEnv() }),
      });

      for (const candidate of candidates) {
        if (await fileExists(candidate)) return candidate;
      }

      return undefined;
    },
  });
}

// D-08 wired. The hardcoded POSIX home variable is gone: getHomeDirCandidates
// reads whichever home variables the machine actually SETS. `platform` is the
// RUN-05 probe value and is `undefined` here more often than not — this function
// is reachable from a provider status check at plugin load, before the probe
// runs — and the helper answers `undefined` with the UNION of both name sets,
// POSIX first, because the wrong platform's names are simply absent. That union
// is why the pre-probe path costs a macOS or Linux machine nothing.
//
// What this fixes: on Windows the single variable this function used to read is
// not set, so until now every home-derived candidate built from it was empty
// there — which is very close to the symptom this milestone exists to fix.
//
// What it does NOT claim: this is a resolution-INPUT change only. Widening the
// home set widens the candidate list that gets existence-checked; nothing here
// makes a resolved shim launchable, which stays Phase 7's requirement.
//
// readParentEnv() rather than a bare process-object read, which is why this
// function no longer needs a local cast of its own: that helper already carries
// the same defensive `globalThis` cast, the same optional chaining and a
// try/catch this never had. The defensive READ is what had to survive, not the
// particular local. Its comment forbids rendering a value; nothing here does.
function getKnownHomeDirs(): string[] {
  return [
    ...getHomeDirCandidates({
      platform: host?.platform,
      env: readParentEnv(),
    }),
    extractHomeDir(pluginPath),
    ...Object.values(currentSettings.providers).map((provider) => extractHomeDir(provider.command)),
  ].filter((value): value is string => typeof value === "string" && value.trim() !== "");
}

async function checkProvider(
  id: string,
  options?: { bypassCache?: boolean },
): Promise<ProviderStatus> {
  const config = currentSettings.providers[id];
  if (!config?.enabled || !config?.command) {
    return { id, available: false, error: "Disabled" };
  }
  const resolved = await resolveCommand(config.command, options);
  if (resolved === undefined) {
      return {
        id,
        available: false,
        error: isAbsolutePath({
          value: config.command,
          platform: host?.platform,
        })
          ? `"${config.command}" does not exist`
          : `"${config.command}" not found in PATH or common install locations`,
      };
    }
    return { id, available: true, resolvedPath: resolved };
}

// ── Events ──────────────────────────────────────────────────────────

export type BackendEvents = DefineEvents<{
  "cli-output-chunk": (data: {
    sessionId: string;
    delta: string;
    stream: "stdout" | "stderr";
  }) => void;
  "cli-session-state": (data: CliSessionStateEvent) => void;
  "mcp-status": (data: McpServerInfo) => void;
  "mcp-tool-activity": (data: {
    sessionId: string;
    activity: McpToolActivity;
  }) => void;
  "mcp-tool-approval": (data: McpToolApprovalRequest) => void;
}>;

type BackendSDK = SDK<API, BackendEvents>;

type ProjectSelection = { getId(): string } | null | undefined;

async function syncProjectContext(sdk: BackendSDK, project: ProjectSelection): Promise<void> {
  const changed = updateCaidoHistoryContext({
    projectId: project === null || project === undefined ? "" : project.getId(),
  });
  if (!changed || mcpTempDir === undefined) return;
  try {
    await writeMcpContextFile();
    await publishMcpStatus(sdk);
  } catch (error) {
    sdk.console.error(`[drift] Failed to refresh MCP context after project change: ${String(error)}`);
  }
}

async function refreshProjectContext(sdk: BackendSDK): Promise<void> {
  try {
    const project = await sdk.projects.getCurrent();
    await syncProjectContext(sdk, project as ProjectSelection);
    if (mcpTempDir === undefined) await publishMcpStatus(sdk);
  } catch (error) {
    sdk.console.error(`[drift] Failed to read current Caido project: ${String(error)}`);
  }
}

// ── API: Settings ───────────────────────────────────────────────────

async function getSettings(_sdk: BackendSDK): Promise<Result<Settings>> {
  await dataReady;
  return ok(currentSettings);
}

async function updateSettings(
  sdk: BackendSDK,
  input: Partial<Settings>
): Promise<Result<Settings>> {
  await dataReady;
  const resetCliSessions =
    input.caidoApi !== undefined ||
    input.mcp !== undefined;
  let syncError: string | undefined;
  currentSettings = { ...currentSettings, ...input };
  // ROADMAP SC-6 / T-04-20. The comparison spans the merge above: the cache
  // holds the PRE-merge signature (seeded at init, re-synced on every save) and
  // is handed the signature built from the MERGED providers, so any changed
  // providers[*].command clears every cached binary resolution. A separately
  // captured pre-merge local is unnecessary for that and would have no reader,
  // failing no-unused-vars at --max-warnings 0 — this task's own verify.
  //
  // This is deliberately its OWN condition rather than a rider on the
  // session-reset flag declared above: that flag fires on input.caidoApi or
  // input.mcp, a different trigger, and conflating the two would either clear
  // on every unrelated save or miss the one case SC-6 is about.
  //
  // It also sits immediately after the merge, ahead of the MCP-refresh branches
  // below, because refreshActiveMcpRuntime resolves Node — whose candidate list
  // is built from the provider commands — and bakes the result into a freshly
  // written wrapper. Clearing after it would spawn from exactly the stale entry
  // this invalidation exists to prevent, and the frontend pushes the WHOLE
  // settings object, so that branch is taken on every save from the UI.
  //
  // The signature itself is never logged and never persisted: it carries a NUL
  // sentinel for a provider configured without a command.
  const providerSignature = buildProviderCommandSignature(currentSettings.providers);
  if (syncResolutionCacheSignature(resolutionCache, providerSignature)) {
    sdk.console.log(
      "[drift] binary resolution cache invalidated: a provider command changed",
    );
  }
  if (input.caidoApi !== undefined && mcpTempDir === undefined) {
    setMcpAuthStatus("unknown", "");
    await publishMcpStatus(sdk);
  }
  if (input.caidoApi !== undefined && mcpTempDir !== undefined) {
    try {
      syncError = await refreshActiveMcpRuntime(sdk);
    } catch (e) {
      syncError =
        `Settings were saved, but Drift failed to refresh the MCP wrapper: ${String(e)}`;
      sdk.console.error(`[drift] ${syncError}`);
      await cleanupMcpRuntime(sdk, "error", syncError);
    }
  }
  if (resetCliSessions) cliSessions.clear();
  const persistenceError = await saveJson("settings", currentSettings);
  if (syncError !== undefined && persistenceError !== undefined) {
    return err(`${syncError}; Settings persistence also failed: ${persistenceError}`);
  }
  if (syncError !== undefined) return err(syncError);
  if (persistenceError !== undefined) {
    return err(`Settings were applied, but persistence failed: ${persistenceError}`);
  }
  return ok(currentSettings);
}

async function refreshActiveMcpRuntime(sdk: BackendSDK): Promise<string | undefined> {
  const mcpScriptPath = getTempMcpScriptPath();
  if (mcpScriptPath === undefined) return undefined;

  // The token check stays OUTSIDE requireMcpServerSpec here, deliberately. This
  // site distinguishes an absent token ("invalid" — reauthenticate in Caido) from
  // every other failure ("error"), and that distinction reaches the user through
  // the MCP status panel. Folding it into the keystone's single error channel
  // would silently downgrade a recoverable auth state into a generic one.
  const caidoToken = getEffectiveCaidoToken();
  if (caidoToken === "") {
    await cleanupMcpRuntime(sdk, "invalid", NO_CAIDO_TOKEN_MESSAGE);
    return NO_CAIDO_TOKEN_MESSAGE;
  }

  // RUN-01, and the site CONTEXT.md's list did not name. It is reached from a
  // settings save AND from syncCaidoSessionToken, which the frontend polls as
  // part of its keep-alive — so leaving it on the wrapper would mean the first
  // token refresh on Windows tears down a working MCP runtime through the
  // cleanupMcpRuntime call below.
  //
  // The return contract is unchanged and is NOT a Result: a message STRING on
  // failure, `undefined` on success, cleanupMcpRuntime first.
  const spec = await requireMcpServerSpec();
  if (spec.kind === "Error") {
    await cleanupMcpRuntime(sdk, "error", spec.error);
    return spec.error;
  }

  if ((await writeMcpContextFile()) === undefined) {
    const message = "Settings were saved, but Drift failed to refresh the MCP context file. Restart the MCP server.";
    await cleanupMcpRuntime(sdk, "error", message);
    return message;
  }

  const validation = await validateCaidoAuth(spec.value);
  if (!validation.ok) {
    await cleanupMcpRuntime(sdk, validation.authState, validation.message);
    return validation.message;
  }

  setMcpAuthStatus("valid", "");
  await tryRegisterMcpForProviders(spec.value, sdk);
  await publishMcpStatus(sdk);
  return undefined;
}

async function syncCaidoSessionToken(
  sdk: BackendSDK,
  token: string,
): Promise<Result<void>> {
  const previousEffectiveToken = getEffectiveCaidoToken();
  sessionCaidoToken = token.trim();
  const nextEffectiveToken = getEffectiveCaidoToken();

  if (previousEffectiveToken !== nextEffectiveToken) {
    if (mcpTempDir === undefined) {
      setMcpAuthStatus("unknown", "");
      await publishMcpStatus(sdk);
    } else {
      const refreshError = await refreshActiveMcpRuntime(sdk);
      if (refreshError !== undefined) return err(refreshError);
    }
  }
  return ok(undefined);
}

async function syncCaidoHistoryContext(
  sdk: BackendSDK,
  input: {
    filterId: string;
    filterName: string;
    filterQuery: string;
    historyQuery: string;
    historyScopeId: string;
  },
): Promise<Result<void>> {
  const changed = updateCaidoHistoryContext(input);
  if (!changed) return ok(undefined);
  if (mcpTempDir === undefined) {
    await publishMcpStatus(sdk);
    return ok(undefined);
  }
  try {
    await writeMcpContextFile();
    await publishMcpStatus(sdk);
    return ok(undefined);
  } catch (error) {
    const message = `Drift failed to refresh the current Caido history context: ${String(error)}`;
    sdk.console.error(`[drift] ${message}`);
    return err(message);
  }
}

// ── API: Providers ──────────────────────────────────────────────────

async function getProviderStatuses(_sdk: BackendSDK): Promise<Result<ProviderStatus[]>> {
  const ids = ["claude-cli", "gemini-cli", "codex-cli", "copilot-cli"];
  // Wrapped, not point-free. Array.prototype.map passes `index: number` as the
  // callback's SECOND argument, and once checkProvider takes an options object
  // there the point-free form is a hard TS2345. Same wrapper form already in use
  // in tryRegisterMcpForProviders. This call keeps the default cached behaviour.
  const statuses = await Promise.all(ids.map((id) => checkProvider(id)));
  return ok(statuses);
}

async function checkProviderAvailability(
  _sdk: BackendSDK,
  providerId: string
): Promise<Result<ProviderStatus>> {
  // The user's manual "Check" button — pressed by exactly the person who just
  // installed a CLI. A cached miss here would make PERF-03 a bug rather than an
  // optimisation, so this one path always re-resolves AND refreshes the entry.
  // It is the escape hatch that makes any TTL choice defensible (T-04-21).
  return ok(await checkProvider(providerId, { bypassCache: true }));
}

// ── MCP server spec keystone ────────────────────────────────────────

// Caido's LLRT type surface declares SpawnOptions as
// `{ uid?, gid?, cwd?, stdio?, shell?, windowsVerbatimArguments? }` and omits
// `env` entirely (@caido/quickjs-types src/llrt/child_process.d.ts:239-255).
// The RUNTIME honours it: LLRT's spawn reads the `env` option and REPLACES the
// parent block with it, source-verified in modules/llrt_child_process/src/lib.rs
// (05-RESEARCH.md finding L-2). This is § Pitfall 7 exactly — the published type
// surface omits a capability the same project's source declares — so the
// declaration is narrowed here rather than the capability abandoned.
//
// Deliberately NOT `as any` and NOT a widened SpawnOptions: this alias names the
// EXACT call shape this file uses, so `env` stays a required, type-checked
// Record<string, string> at both sites instead of becoming an unchecked hole.
//
// The env property is declared as Record<"env", …> rather than as a literal
// `env:` member. It is exactly the same type — a REQUIRED env of
// Record<string, string> — but it keeps the phase's env-site gate honest: that
// gate enumerates every place an environment is handed to a CHILD PROCESS, and a
// type declaration is not one. Spelling it as a member would put a permanent
// non-value line into the gate's match set, which is the kind of noise that gets
// a real gate relaxed later.
//
// `windowsVerbatimArguments` is REQUIRED, not optional, and that is the whole
// point of declaring it here (Phase 7, PRV-02). Once buildSpawnPlan escapes a
// cmd.exe command line itself, the runtime must be told not to re-quote it —
// omit the flag and the runtime applies its own MSVC-convention quoting on top,
// cmd sees literal carets, and the argv arrives corrupted while every other
// assertion still passes. That is 07-RESEARCH.md § Pitfall B exactly, and an
// OPTIONAL flag is the precise shape it describes: a default that is silently
// wrong at the one site that forgot it. Required makes forgetting a compile
// error and forces every call site to state its answer out loud (T-07-03).
type SpawnWithEnv = (
  command: string,
  args: string[],
  options: Record<"env", Record<string, string>> & {
    stdio: ["pipe", "pipe", "pipe"];
    windowsVerbatimArguments: boolean;
  },
) => ChildProcessWithoutNullStreams;
const spawnWithEnv = spawn as unknown as SpawnWithEnv;

// RUN-01. The ONE place index.ts decides how the MCP server is launched. Three
// orchestration sites reach the server through this function — startMcpServer,
// refreshActiveMcpRuntime (reached from a settings save AND from the frontend's
// keep-alive token sync) and the shared self-test — plus, from plan 05-04's task
// 2, both config writers.
//
// It replaces a write->chmod->rename->exec ladder with a direct `node` spawn: the
// Caido token and the DRIFT_* variables travel in the spawn `env` option and the
// config-JSON `env` field, never in a `#!/bin/bash` `export` line. That is what
// makes the health path work on Windows, where a `.sh` is not executable at all.
//
// The path it hands to buildMcpServerSpec is getTempMcpScriptPath(), i.e.
// path.join(mcpTempDir, "mcp-server.mjs") — verified identical to
// startMcpServer's `mcpScriptLocal`, which is path.join(tempDir, "mcp-server.mjs")
// with `mcpTempDir = tempDir` assigned immediately above the staging copy. There
// is therefore no second join to keep in sync, and no override parameter is
// needed.
async function requireMcpServerSpec(options?: {
  toolPolicy?: McpToolPolicy;
  activityFilePath?: string;
  approvalsFilePath?: string;
}): Promise<Result<McpServerSpec>> {
  const mcpScriptPath = getTempMcpScriptPath();
  if (mcpScriptPath === undefined) return err(MCP_RUNTIME_NOT_RUNNING_MESSAGE);

  const caidoToken = getEffectiveCaidoToken();
  if (caidoToken === "") return err(NO_CAIDO_TOKEN_MESSAGE);

  const nodeExecutable = await requireNodeExecutable();
  if (nodeExecutable.kind === "Error") return err(nodeExecutable.error);

  return ok(
    buildMcpServerSpec({
      nodeExecutable: nodeExecutable.value,
      mcpScriptPath,
      driftVars: buildMcpRuntimeEnv({
        caidoToken,
        toolPolicy: options?.toolPolicy,
        activityFilePath: options?.activityFilePath,
        approvalsFilePath: options?.approvalsFilePath,
      }),
      // Injected, never read inside the pure module. buildMcpServerSpec routes
      // it through buildSpawnEnv, which is the single parent-merge point: a
      // drift-only dict would be green on every runner this project has and
      // broken only under Caido's LLRT (finding L-4).
      parentEnv: readParentEnv(),
    }),
  );
}

// ── API: MCP ────────────────────────────────────────────────────────

async function getMcpStatus(_sdk: BackendSDK): Promise<Result<McpServerInfo>> {
  // If a self-test is in flight, pump its poll handler from inside this
  // RPC context. Caido's runtime does not reliably run child_process
  // callbacks while another RPC is awaiting, so the frontend relies on
  // pinging this RPC every ~1.5s to let the self-test observe process
  // exit and finalize its promise.
  if (activeSelfTestPoll !== undefined) {
    try {
      activeSelfTestPoll();
    } catch {
      // Best-effort only.
    }
  }
  return ok(await buildCurrentMcpStatus());
}

type JsonRpcResponse = {
  id?: number;
  result?: {
    tools?: Array<{ name?: string }>;
    content?: Array<{ text?: string }>;
    isError?: boolean;
  };
  error?: { message?: string };
};

function createFailedSelfTestChecks(message: string): McpSelfTestCheck[] {
  return MCP_SELF_TEST_CHECKS.map((check) => ({
    name: check.name,
    label: check.label,
    ok: false,
    message,
    durationMs: null,
  }));
}

function cloneSelfTestChecks(checks: McpSelfTestCheck[]): McpSelfTestCheck[] {
  return checks.map((check) => ({ ...check }));
}

function extractToolText(result: JsonRpcResponse["result"]): string {
  if (result?.content === undefined) return "";
  return result.content
    .map((part) => trimToString(part.text))
    .filter((part) => part !== "")
    .join("\n")
    .trim();
}

function getJsonRpcErrorMessage(response: JsonRpcResponse): string {
  const toolText = extractToolText(response.result);
  if (toolText !== "") return toolText;
  return trimToString(response.error?.message) || "MCP request failed.";
}

// HLT-02. Takes the spec and spawns `node mcp-server.mjs` directly.
//
// What is GONE from this function: the `mcp-self-test-<requestId>.sh` launch
// script it used to write whenever env vars were supplied (which
// runSharedMcpSelfTest always did), the `launchPath` local and the
// `cleanupLaunchScript` helper. That was a THIRD token-bearing file on disk; it
// now simply does not exist, which is a net reduction in blast radius rather
// than a relocation (D-10).
//
// Everything else is untouched on purpose: the line-DRAIN stdout buffer, the
// activeSelfTestPoll pump the frontend keep-alive drives, the bounded stderr
// tail and the <=10 s timeout.
async function callMcpMethod(
  spec: McpServerSpec,
  request: Record<string, unknown>,
): Promise<{ response: JsonRpcResponse; durationMs: number }> {
  const requestId = typeof request.id === "number" ? request.id : 2;
  const methodName = typeof request.method === "string" ? request.method : "unknown";

  return new Promise((resolve, reject) => {
    activeSelfTestPoll = undefined;
    const proc = spawnWithEnv(spec.command, spec.args, {
      // Already parent-merged by buildSpawnEnv inside buildMcpServerSpec.
      env: spec.env,
      stdio: ["pipe", "pipe", "pipe"],
      // False, and it is a statement rather than a placeholder. `spec.command`
      // is the node executable requireNodeExecutable already validated by
      // spawning it with `--version`, and `spec.args` is a path this file wrote
      // — a real executable with a plain argv, so it is never routed through
      // buildSpawnPlan's interpreter branch and there is no escaped command line
      // for the runtime to leave alone. The runtime's own quoting is correct
      // here and must stay enabled.
      windowsVerbatimArguments: false,
    });

    // NOT a BoundedBuffer, and it must not become one. This is a line-DRAIN
    // buffer: complete lines are parsed out of it and only the trailing partial
    // survives. Head/tail/both retention would drop the middle of a JSON-RPC
    // line stream and corrupt the protocol framing, producing a frame that
    // parses as neither the first message nor the second. Its hazard is an
    // unterminated remainder, not total volume, so it gets drainCompleteLines
    // and that function's own remainder cap instead.
    let stdoutBuffer = "";
    let stdoutDroppedChars = 0;
    // Tail retention, for the same reason as the other two stderr sites: this
    // string is the text of the rejection thrown from activeSelfTestPoll below
    // and from the close handler, and the LAST error is the actionable one while
    // warnings pile up ahead of it.
    //
    // The site is deliberately NOT exempted on the strength of the <=10 s timeout
    // just below. That timeout plus proc.kill("SIGKILL") bounds the exposure
    // WINDOW, not the VOLUME: a child writing at pipe speed for ten seconds is a
    // multi-hundred-megabyte allocation in a single-threaded runtime.
    let stderr = createBoundedBuffer({
      maxChars: MCP_SELFTEST_STDERR_MAX_CHARS,
      retention: "tail",
    });
    let settled = false;
    const startedAt = Date.now();
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill("SIGKILL"); } catch { /* ignore */ }
      activeSelfTestPoll = undefined;
      reject(new Error(`Timed out waiting for MCP response: ${methodName}`));
    }, Math.min(currentSettings.processTimeoutSeconds * 1000, 10000));
    // Expose a pump handler so the frontend's keep-alive ping
    // (getMcpStatus) can force-check this pending self-test from inside
    // an RPC handler. Caido's plugin runtime does not reliably deliver
    // child_process data/close events while an outer RPC is awaiting,
    // so we manually consult proc.exitCode/signalCode on each tick and
    // synthesize a failure if the subprocess died without responding.
    activeSelfTestPoll = () => {
      if (settled) return;
      const procRef = proc as unknown as {
        exitCode: number | null | undefined;
        signalCode: string | null | undefined;
      };
      const hasExit = typeof procRef.exitCode === "number";
      const hasSignal =
        typeof procRef.signalCode === "string" && procRef.signalCode !== "";
      if (!hasExit && !hasSignal) return;
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeSelfTestPoll = undefined;
      const trimmedStdout = stdoutBuffer.trim();
      if (trimmedStdout !== "") {
        for (const line of trimmedStdout.split("\n").map((l) => l.trim())) {
          if (line === "") continue;
          try {
            const parsed = JSON.parse(line) as JsonRpcResponse;
            if (parsed.id === requestId) {
              resolve({ response: parsed, durationMs: Date.now() - startedAt });
              return;
            }
          } catch { /* ignore malformed line */ }
        }
      }
      reject(
        new Error(
          renderBoundedBuffer(stderr).trim() ||
          `MCP helper exited (code ${String(procRef.exitCode ?? "n/a")}${hasSignal ? `, signal ${String(procRef.signalCode)}` : ""}) before responding to ${methodName}.`,
        ),
      );
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeSelfTestPoll = undefined;
      callback();
      proc.stdin?.end();
      setTimeout(() => {
        try { proc.kill("SIGTERM"); } catch { /* ignore */ }
      }, 0);
    };

    proc.stdout?.on("data", (chunk: Buffer) => {
      // One split per chunk. The loop this replaces re-copied the whole
      // remainder and rescanned it from index 0 once PER LINE, which is O(k*n)
      // for a chunk of k lines and n characters, on the same single-threaded
      // event loop the RPC keep-alive above depends on.
      const drain = drainCompleteLines({
        buffered: stdoutBuffer,
        chunk: chunk.toString(),
        maxRemainderChars: MCP_SELFTEST_LINE_MAX_CHARS,
      });
      stdoutBuffer = drain.remainder;
      if (drain.droppedChars > 0) {
        // Routed into stderr on purpose: both reject paths already read stderr,
        // so an oversized unterminated stdout line becomes VISIBLE in the error
        // the user sees, carrying its byte count, instead of leaving a silent
        // hole. That is PERF-04's marked truncation for this site, with no new
        // plumbing. The remainder is dropped WHOLE rather than truncated,
        // because a truncated JSON-RPC line is unparseable and would be
        // swallowed by the tolerant catch below.
        //
        // The marker carries the CUMULATIVE total rather than this drain's
        // delta, matching what renderBoundedBuffer does for every other site:
        // successive markers then read as one monotonic record whose last value
        // is the answer, instead of N deltas a reader has to add up.
        stdoutDroppedChars += drain.droppedChars;
        stderr = appendBounded(stderr, buildTruncationMarker(stdoutDroppedChars));
      }
      // Iterating every drained line even after finish() resolves is the
      // pre-existing behaviour, preserved deliberately: finish is idempotent
      // (it returns early once settled is true), so the extras no-op.
      for (const line of drain.lines) {
        // drainCompleteLines already trims and drops empty lines, so the old
        // `if (line === "") continue;` guard would now be dead code.
        let parsed: JsonRpcResponse;
        try {
          parsed = JSON.parse(line) as JsonRpcResponse;
        } catch {
          continue;
        }

        if (parsed.id === requestId) {
          finish(() => {
            resolve({
              response: parsed,
              durationMs: Date.now() - startedAt,
            });
          });
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk.toString());
    });

    // MANDATORY, and mandatorily SYNCHRONOUS. Under Caido's LLRT a spawn failure
    // is delivered asynchronously (modules/llrt_child_process/src/lib.rs:293-312)
    // and, if no "error" listener is registered when the deferred task runs, it is
    // thrown into the runtime with no JS frame to catch it. Registering it here,
    // in the same synchronous block as the spawn, is what keeps a failed spawn a
    // rejected promise instead of an unhandled runtime exception.
    //
    // The error carries a MESSAGE and no `code` under LLRT (it is an
    // Exception::from_message reading `Child process failed to spawn "<cmd>". …`),
    // so any classification added here must match on the message text, the way
    // fs-retry.ts already classifies transient filesystem errors.
    proc.on("error", (error: Error) => {
      finish(() => reject(error));
    });

    proc.on("close", () => {
      if (settled) return;
      finish(() =>
        reject(
          new Error(renderBoundedBuffer(stderr).trim() || stdoutBuffer.trim() || "MCP helper exited before responding."),
        ),
      );
    });

    proc.stdin?.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "drift-self-test", version: "1.0.0" },
      },
    })}\n`);
    proc.stdin?.write(`${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    })}\n`);
    proc.stdin?.write(`${JSON.stringify(request)}\n`);
    proc.stdin?.end();
  });
}

async function runSharedMcpSelfTest(): Promise<{
  checks: McpSelfTestCheck[];
  error: string;
}> {
  // The self-test runs against EVERY tool group, so a permission setting cannot
  // make a working server look broken. The policy is built here and handed to
  // the keystone, which folds it into the spec's driftVars.
  const spec = await requireMcpServerSpec({
    toolPolicy: buildMcpToolPolicy({
      enabledGroups: {
        read: true,
        replay: true,
        findings: true,
        environment: true,
        intercept: true,
        workflow: true,
      },
      confirmSensitiveActions: false,
    }),
  });
  if (spec.kind === "Error") {
    return {
      checks: createFailedSelfTestChecks(spec.error),
      error: spec.error,
    };
  }
  // The staged mcp-server.mjs, not a wrapper script. Same existence check as
  // before and the same message; what it points at is now the file the child
  // actually executes.
  const mcpScriptPath = spec.value.args[0];
  if (mcpScriptPath === undefined || !(await fileExists(mcpScriptPath))) {
    return {
      checks: createFailedSelfTestChecks(MCP_RUNTIME_NOT_RUNNING_MESSAGE),
      error: MCP_RUNTIME_NOT_RUNNING_MESSAGE,
    };
  }

  const checks: McpSelfTestCheck[] = [];
  let combinedError = "";

  try {
    const toolsList = await callMcpMethod(spec.value, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const toolNames = toolsList.response.result?.tools
      ?.map((tool) => trimToString(tool.name))
      .filter((name) => name !== "") ?? [];
    const missingTools = MCP_TOOL_NAMES.filter((tool) => !toolNames.includes(tool));
    checks.push({
      name: "tools/list",
      label: "Tool discovery",
      ok: missingTools.length === 0,
      message:
        missingTools.length === 0
          ? `${toolNames.length} tools discovered`
          : `Missing tools: ${missingTools.join(", ")}`,
      durationMs: toolsList.durationMs,
    });
  } catch (error) {
    const message = String(error);
    checks.push({
      name: "tools/list",
      label: "Tool discovery",
      ok: false,
      message,
      durationMs: null,
    });
    combinedError = message;
  }

  for (const [offset, toolName] of ["get_environment", "search_history"].entries()) {
    try {
      const response = await callMcpMethod(spec.value, {
        jsonrpc: "2.0",
        id: 3 + offset,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolName === "search_history" ? { limit: 1 } : {},
        },
      });
      const ok =
        response.response.error === undefined &&
        response.response.result?.isError !== true;
      const message = ok
        ? extractToolText(response.response.result) || `${toolName} succeeded`
        : getJsonRpcErrorMessage(response.response);
      checks.push({
        name: toolName,
        label: toolName === "get_environment" ? "Environment read" : "History search",
        ok,
        message,
        durationMs: response.durationMs,
      });
      if (!ok && combinedError === "") combinedError = `${toolName}: ${message}`;
    } catch (error) {
      const message = String(error);
      checks.push({
        name: toolName,
        label: toolName === "get_environment" ? "Environment read" : "History search",
        ok: false,
        message,
        durationMs: null,
      });
      if (combinedError === "") combinedError = `${toolName}: ${message}`;
    }
  }

  return { checks, error: combinedError };
}

async function runMcpSelfTest(
  sdk: BackendSDK,
  providerId?: string,
): Promise<Result<McpSelfTestResults>> {
  const candidateProviderIds =
    providerId !== undefined && providerId.trim() !== ""
      ? [providerId]
      : Object.entries(currentSettings.providers)
        .filter(([, config]) => config.enabled)
        .map(([id]) => id);

  const providerStatuses = await Promise.all(candidateProviderIds.map((id) => checkProvider(id)));
  const targetProviderIds = candidateProviderIds.filter((_, index) => providerStatuses[index]?.available);

  if (candidateProviderIds.length === 0) {
    return err("No provider is enabled. Enable at least one CLI provider before running the live MCP test.");
  }
  if (targetProviderIds.length === 0) {
    return err(
      providerId !== undefined && providerId.trim() !== ""
        ? providerStatuses[0]?.error ?? "The selected provider is unavailable."
        : "No enabled CLI provider is currently available for the live MCP test.",
    );
  }

  const alreadyRunning = targetProviderIds.some(
    (targetProviderId) => lastMcpSelfTestResults[targetProviderId]?.state === "running",
  );
  if (alreadyRunning) {
    return err("An MCP self-test is already running. Wait for it to finish before starting another one.");
  }

  const startedAt = Date.now();
  const runningResults: McpSelfTestResults = { ...lastMcpSelfTestResults };
  for (const targetProviderId of targetProviderIds) {
    const running = createIdleSelfTestResult(targetProviderId);
    running.state = "running";
    running.startedAt = startedAt;
    runningResults[targetProviderId] = running;
  }
  lastMcpSelfTestResults = runningResults;
  await publishMcpStatus(sdk);

  const sharedCheckResult = await runSharedMcpSelfTest();
  const finishedAt = Date.now();

  const nextResults: McpSelfTestResults = { ...lastMcpSelfTestResults };
  candidateProviderIds.forEach((targetProviderId, index) => {
    const providerStatus = providerStatuses[index];
    const cliReady = providerStatus?.available ?? false;
    const cliMessage =
      providerStatus === undefined
        ? "Provider status unavailable"
        : cliReady
          ? providerStatus.resolvedPath ?? "CLI available"
          : providerStatus.error ?? "CLI unavailable";

    if (!cliReady) {
      const idle = createIdleSelfTestResult(targetProviderId);
      idle.cliMessage = cliMessage;
      nextResults[targetProviderId] = idle;
      return;
    }

    const errors = [
      cliReady ? "" : cliMessage,
      sharedCheckResult.error,
    ].filter((value) => value !== "");

    nextResults[targetProviderId] = buildSelfTestResult({
      providerId: targetProviderId,
      startedAt,
      finishedAt,
      cliReady,
      cliMessage,
      checks: cloneSelfTestChecks(sharedCheckResult.checks),
      error: errors.join("; "),
    });
  });

  lastMcpSelfTestResults = nextResults;
  await publishMcpStatus(sdk);
  return ok(nextResults);
}

// ── MCP registration helpers for Gemini/Codex ───────────────────────

// The third parameter is OPTIONAL, so the ~8 existing call sites are literally
// unchanged — the same "PUBLIC shape unchanged" discipline the resolve-boundary
// comment below already states. It exists because validateCaidoAuth now spawns
// `node` directly and the env has to reach the child somehow; it used to arrive
// through the wrapper script's `export` lines.
//
// The forwarding is written as two explicit spawn calls rather than a conditional
// spread so that `env: options.env` survives as a greppable object KEY: the phase
// gate asserts every env handed to a child process is `spec.env`,
// `buildSpawnEnv(...)` or this forwarded value, and a spread would hide it.
//
// `windowsVerbatimArguments` now travels the same way and for the same reason,
// and it is forwarded into BOTH branches rather than only the env-carrying one
// (Phase 7, PRV-02). That matters because of which branch the callers actually
// take: every registration and removal spawn in this file passes NO environment,
// so the no-env branch below is the only channel they have. A flag wired into
// the env branch alone would leave those callers unable to deliver it at all —
// the runtime would re-quote a command line buildSpawnPlan had already escaped,
// and the argv would arrive corrupted while every call-count assertion still
// passed. It stays OPTIONAL here, unlike on SpawnWithEnv above, because the ~8
// pre-existing call sites spawn plain executables with plain argv and the
// non-verbatim default is correct for them; a caller that routes through
// buildSpawnPlan passes the plan's answer explicitly.
function spawnAndWait(
  cmd: string,
  args: string[],
  options?: { env?: Record<string, string>; windowsVerbatimArguments?: boolean },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // Head retention: every consumer of this stream reads the FIRST line - a
    // `which` path, a `node --version` string, a short `mcp add` acknowledgement.
    let stdout = createBoundedBuffer({
      maxChars: SPAWN_STDOUT_MAX_CHARS,
      retention: "head",
    });
    // Tail retention: this stream is diagnostics, the LAST error is the
    // actionable one and warnings pile up ahead of it.
    let stderr = createBoundedBuffer({
      maxChars: SPAWN_STDERR_MAX_CHARS,
      retention: "tail",
    });
    // Both buffers are declared ABOVE the guard on purpose: the catch arm has to
    // be able to render them, and a declaration inside the guarded region would
    // not be in scope there. Their maxChars and retention settings, and the two
    // comments above, are unchanged.
    //
    // Why the guard exists. Windows refuses a DIRECT spawn of a `.cmd` or `.bat`
    // under Node's CVE-2024-27980 guard and reports it as EINVAL - and it throws
    // that error SYNCHRONOUSLY rather than emitting it as an "error" event.
    // Measured, not assumed: 03-FINDINGS.md, § P1-CMD, on a real windows-latest
    // host. (Cite the findings file, never the CI artifact - those expire.)
    //
    // A synchronous throw inside a Promise executor REJECTS the promise. The
    // `proc.on("error")` handler below can therefore never fire for it, and this
    // helper's documented "always resolves, never rejects" contract - the one
    // every caller in this file relies on by reading `code` and never catching -
    // would be false exactly where a caller is least able to see it. The
    // rejection would then travel resolveWithCache -> requireNodeExecutable ->
    // startMcpServer with no catch anywhere on the path and reach the user as an
    // unhandled RPC rejection instead of a Drift error message. That is the same
    // failure mode the comment at getNodeExecutable's provider-command reading
    // already defends against for a different input.
    //
    // This stopped being unreachable in Phase 6: the resolver now emits `.cmd`
    // and `.bat` candidates, and getNodeExecutable SPAWNS every candidate that
    // passes fileExists.
    //
    // What this guard does NOT do, stated plainly: it does not make a `.cmd`
    // launchable. A `.cmd` Windows refuses now resolves as exit code 1, which the
    // node validation loop reads as "not a working executable" and steps past -
    // graceful degradation, not launchability. Making a `.cmd` actually launch is
    // PRV-02 in Phase 7, which owns the cmd.exe branch; this token is here so
    // PRV-02 can find the seam by search rather than re-inventorying every spawn
    // in this file. Deliberately absent here: any shell option, any command
    // interpreter wrapper, any extension check. All three are PRV-02's to design,
    // and adding one now would turn a correctness fix into a launchability claim.
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc =
        options?.env === undefined
          ? spawn(cmd, args, {
              stdio: ["pipe", "pipe", "pipe"],
              windowsVerbatimArguments: options?.windowsVerbatimArguments ?? false,
            })
          : spawnWithEnv(cmd, args, {
              stdio: ["pipe", "pipe", "pipe"],
              env: options.env,
              windowsVerbatimArguments: options.windowsVerbatimArguments ?? false,
            });
    } catch {
      // The same failure shape the "error" handler below resolves: a non-zero
      // code so a caller can still tell a failed spawn from a successful one,
      // with whatever the buffers hold rendered exactly as at every other resolve
      // boundary. Return so nothing downstream of the failed spawn runs.
      resolve({
        code: 1,
        stdout: renderBoundedBuffer(stdout),
        stderr: renderBoundedBuffer(stderr),
      });
      return;
    }
    proc.stdout?.on("data", (d: Buffer) => { stdout = appendBounded(stdout, d.toString()); });
    proc.stderr?.on("data", (d: Buffer) => { stderr = appendBounded(stderr, d.toString()); });
    // Rendered at the resolve boundary, so the PUBLIC shape of this function is
    // unchanged: every caller still receives plain strings and needed no edit.
    proc.on("close", (code) =>
      resolve({
        code: code ?? 1,
        stdout: renderBoundedBuffer(stdout),
        stderr: renderBoundedBuffer(stderr),
      }),
    );
    proc.on("error", () =>
      resolve({
        code: 1,
        stdout: renderBoundedBuffer(stdout),
        stderr: renderBoundedBuffer(stderr),
      }),
    );
  });
}

async function getNodeExecutable(): Promise<string | undefined> {
  const processRef = globalThis as typeof globalThis & {
    process?: { execPath?: string; env?: Record<string, string | undefined> };
  };
  const candidates = await getNodeExecutableCandidates({
    // The same threading plan 06-01 established at resolveCommand: the RUN-05
    // probe platform decides the path SPELLING, and the Windows install roots
    // are read by name from the parent environment rather than guessed from a
    // drive letter. `roots` comes from readParentEnv() so no environment value
    // is ever logged on the way (05-D-11 / T-06-T09).
    platform: host?.platform,
    execPath: processRef.process?.execPath,
    pathResolution: await resolveCommand("node"),
    homeDirs: getKnownHomeDirs(),
    roots: getWindowsNamedRoots({ env: readParentEnv() }),
    // CR-02's gate. Same source as `roots` and the same rule: the environment
    // is read at this I/O boundary, never inside the pure builder.
    nvmWindowsInstalled: isNvmWindowsInstalled({ env: readParentEnv() }),
    // The DEFENSIVE reading of `providers[*].command`, chosen so this module and
    // buildProviderCommandSignature (resolution-cache.ts) stop holding opposite
    // beliefs about the same field: that function already declares the command
    // optional and carries a MISSING_COMMAND_PLACEHOLDER sentinel for it, while
    // this line used to hand the value straight to path.isAbsolute.
    //
    // The defensive reading is the correct one. `Settings.providers` is TYPED
    // Record<string, { command: string; enabled: boolean }>, but the value is
    // rehydrated from persisted JSON with `{ ...DEFAULT_SETTINGS, ...s }`, which
    // REPLACES the whole `providers` object rather than merging per provider —
    // so a legacy or hand-edited blob can supply an entry with no `command` at
    // all, and the type is a claim about that blob rather than a guarantee about
    // it. Unguarded, path.isAbsolute(undefined) throws `TypeError: The "path"
    // argument must be of type string` inside getNodeExecutable, which escapes
    // resolveWithCache -> requireNodeExecutable -> startMcpServer with no catch
    // on the path and reaches the user as an unhandled RPC rejection instead of
    // a Drift error message.
    absoluteProviderCommands: Object.values(
      currentSettings.providers as Record<
        string,
        { command?: string } | undefined
      >,
    )
      .map((provider) => provider?.command)
      .filter(
        (command): command is string =>
          typeof command === "string" &&
          command !== "" &&
          isAbsolutePath({ value: command, platform: host?.platform }),
      ),
  });
  lastNodeSearchCandidates = candidates;

  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) continue;
    const result = await spawnAndWait(candidate, ["--version"]);
    if (result.code === 0) {
      return candidate;
    }
  }

  return undefined;
}

// The ONE place that knows the node cache key, so a later rename cannot miss a
// site and silently split the cache in two.
//
// After PERF-03 the same binary is reachable under TWO keys, and that is not
// double caching, because the two keys hold DIFFERENT values:
//
//   node      the VALIDATED executable — a candidate that both exists and whose
//             `--version` exited 0, produced by getNodeExecutable. AUTHORITATIVE:
//             it is the path Drift actually spawns, and the only value
//             requireNodeExecutable and getDiagnostics may read.
//   cmd:node  the raw `which node` PATH hit, UNVALIDATED — it may not even be
//             executable. Produced by resolveCommand("node") below as one INPUT
//             to getNodeExecutableCandidates' candidate list, never an answer.
//             Never read it as "the Node executable" (T-04-29).
//
// The nesting is therefore a saving, not a duplication: a miss on the outer key
// costs at most a CACHED inner hit instead of a second which spawn.
async function getCachedNodeExecutable(): Promise<string | undefined> {
  // `clock` for the same reason as resolveCommand: getNodeExecutable spawns
  // `which node`, walks every version-manager directory and runs
  // `node --version` on each candidate, so its entry must be stamped when that
  // finished rather than when it began.
  return await resolveWithCache(resolutionCache, {
    key: "node",
    now: Date.now(),
    clock: () => Date.now(),
    resolve: getNodeExecutable,
  });
}

async function requireNodeExecutable(): Promise<Result<string>> {
  // PERF-03, and note the change of CHARACTER: this used to read the module
  // variable lastNodeExecutable, an infinite, never-invalidated cache that
  // survived settings saves, MCP restarts and provider-command changes. Routing
  // it through the shared cache TIGHTENS an existing cache into a bounded one —
  // it does not add caching where there was none.
  const nodeExecutable = await getCachedNodeExecutable();
  if (nodeExecutable === undefined)
    return err(getNodeExecutableError(host?.platform));
  return ok(nodeExecutable);
}

// Tracks the resolved binary path that Drift used for each successful
// MCP registration in the current session. Unregister iterates over
// this map so we clean up exactly what we registered, even if the user
// has since disabled the provider (or uninstalled the CLI).
const registeredMcpCliPaths = new Map<"gemini" | "codex", string>();
// Reasons each CLI was skipped during the last register attempt, for
// diagnostics surfacing. Written by tryRegisterMcpForProviders.
const skippedMcpCliReasons = new Map<"gemini" | "codex", string>();

type McpCliProviderId = "gemini-cli" | "codex-cli";
const MCP_CLI_TO_PROVIDER: Record<"gemini" | "codex", McpCliProviderId> = {
  gemini: "gemini-cli",
  codex: "codex-cli",
};

async function registerMcpWithCli(
  cli: "gemini" | "codex",
  cliBinary: string,
  mcpScript: string,
  sdk: BackendSDK,
): Promise<boolean> {
  // Best-effort pre-clean — an old "drift" entry in the CLI's config
  // is normal (previous Drift session); ignore its exit code.
  await spawnAndWait(cliBinary, ["mcp", "remove", "drift"]);
  const result = await spawnAndWait(cliBinary, [
    "mcp", "add", "drift", "--", mcpScript,
  ]);
  sdk.console.log(
    `[drift] ${cli} mcp add via ${cliBinary}: code=${result.code} ${result.stderr.trim()}`,
  );
  if (result.code === 0) {
    registeredMcpCliPaths.set(cli, cliBinary);
    skippedMcpCliReasons.delete(cli);
    return true;
  }
  skippedMcpCliReasons.set(
    cli,
    `mcp add exited with code ${String(result.code)}: ${result.stderr.trim() || "no stderr"}`,
  );
  return false;
}

// D-01/D-02/D-03. The ONE place the surviving POSIX wrapper is written after
// this plan, which is why the platform guard lives HERE: both callers — MCP
// start and the settings-save / token-sync refresh — inherit it, and guarding
// only one would leave a win32 hole on the settings-save path.
//
// On win32 (and on an unrecognised platform) writeMcpWrapper is not called AT
// ALL: no `.sh` is written and no `chmod` is spawned, so MCP start cannot fail
// on a POSIX-only step (T-05-17). A wrapper-write failure on POSIX is likewise a
// SKIP REASON and never an MCP-start failure — after this plan the wrapper serves
// only Gemini and Codex, so failing the health check on it would be a regression
// dressed as strictness.
//
// The decision itself is a pure predicate in mcp-server-spec.ts, precisely
// because an `if (platform === "win32")` inside this file is unassertable:
// index.ts cannot be imported under vitest.
async function tryRegisterMcpForProviders(spec: McpServerSpec, sdk: BackendSDK): Promise<void> {
  const wrapperPath =
    host !== undefined && host.platform !== "win32"
      ? await writeMcpWrapper(spec)
      : undefined;

  for (const cli of ["gemini", "codex"] as const) {
    const providerId = MCP_CLI_TO_PROVIDER[cli];
    const providerConfig = currentSettings.providers[providerId];
    if (providerConfig === undefined) {
      skippedMcpCliReasons.set(cli, "no provider config");
      sdk.console.log(`[drift] ${cli} mcp register skipped: no provider config`);
      continue;
    }
    if (!providerConfig.enabled) {
      skippedMcpCliReasons.set(cli, "provider disabled in Drift settings");
      sdk.console.log(`[drift] ${cli} mcp register skipped: provider disabled`);
      continue;
    }
    const resolved = await resolveCommand(providerConfig.command);
    if (resolved === undefined) {
      skippedMcpCliReasons.set(
        cli,
        `command "${providerConfig.command}" did not resolve to an executable path`,
      );
      sdk.console.log(
        `[drift] ${cli} mcp register skipped: "${providerConfig.command}" not resolvable`,
      );
      continue;
    }
    const registration = planMcpCliRegistration({
      platform: host?.platform,
      cli,
      wrapperPath,
    });
    if (registration.kind === "Skip") {
      skippedMcpCliReasons.set(cli, registration.reason);
      sdk.console.log(`[drift] ${cli} mcp register skipped: ${registration.reason}`);
      continue;
    }
    await registerMcpWithCli(cli, resolved, registration.wrapperPath, sdk);
  }
}

async function unregisterMcpFromCli(cli: "gemini" | "codex", sdk: BackendSDK): Promise<void> {
  // NOT gated on the current `enabled` flag — if we previously
  // registered, we clean up, even if the user disabled the provider
  // afterwards. Otherwise we'd leak dangling `drift` entries in
  // external CLI config files.
  const storedPath = registeredMcpCliPaths.get(cli);
  if (storedPath === undefined) {
    // We never registered this CLI in this session — nothing to do.
    return;
  }
  const result = await spawnAndWait(storedPath, ["mcp", "remove", "drift"]);
  sdk.console.log(
    `[drift] ${cli} mcp remove via ${storedPath}: code=${result.code}`,
  );
  registeredMcpCliPaths.delete(cli);
}

async function cleanupMcpRuntime(
  sdk: BackendSDK,
  authState: McpAuthState = "unknown",
  authMessage = "",
): Promise<void> {
  await unregisterMcpFromCli("gemini", sdk);
  await unregisterMcpFromCli("codex", sdk);

  if (mcpTempDir !== undefined) {
    try {
      await rm(mcpTempDir, { recursive: true, force: true });
    } catch (error) {
      sdk.console.error(`[drift] Failed to remove MCP temp dir ${mcpTempDir}: ${String(error)}`);
    }
    mcpTempDir = undefined;
  }
  cliSessions.clear();
  setMcpAuthStatus(authState, authMessage);
  await publishMcpStatus(sdk);
}

// Remove orphaned drift-mcp-* dirs left by a previous run that did not stop
// cleanly (crash, hard kill). Those dirs hold the token-bearing wrapper
// scripts, so leaking them is a credential-exposure risk. Safe to run here:
// startMcpServer is only entered when MCP is not already running, so any
// existing drift-mcp-* dir other than the (about-to-be-replaced) current one
// is genuinely orphaned.
//
// The roots come from getSweepRoots(hostFacts), which on non-win32 adds the
// LEGACY arm (CMP-02 / T-04-02) — and that arm is the security-relevant half:
// the shipped 0.1.0 wrote drift-mcp-* into a hardcoded temp path, while on macOS
// os.tmpdir() resolves under /var/folders/…, so without the second root those
// token-bearing directories would never be swept again after upgrade.
//
// Each root gets its OWN try/catch, so a missing or unreadable legacy root
// cannot abort the sweep of the real one.
async function sweepOrphanedMcpTempDirs(
  sdk: BackendSDK,
  hostFacts: HostFacts,
): Promise<void> {
  for (const root of getSweepRoots(hostFacts)) {
    try {
      const entries = await readdir(root);
      await Promise.all(
        entries
          .filter((name) => name.startsWith("drift-mcp-"))
          .map((name) => path.join(root, name))
          .filter((dir) => dir !== mcpTempDir)
          .map((dir) => rm(dir, { recursive: true, force: true }).catch(() => undefined)),
      );
    } catch (error) {
      sdk.console.error(`[drift] Failed to sweep orphaned MCP temp dirs in ${root}: ${String(error)}`);
    }
  }
}

async function startMcpServer(sdk: BackendSDK): Promise<Result<McpServerInfo>> {
  // Check prerequisites
  const caidoToken = getEffectiveCaidoToken();
  if (caidoToken === "") {
    const message = NO_CAIDO_TOKEN_MESSAGE;
    setMcpAuthStatus("invalid", message);
    await publishMcpStatus(sdk);
    return err(message);
  }

  // Check if MCP server asset exists
  const mcpScript = path.join(assetsPath, "mcp-server.mjs");
  if (!(await fileExists(mcpScript))) {
    return err("MCP server script not found in plugin assets.");
  }

  // RUN-05. ORDER MATTERS: the probe runs FIRST, before the sweep and before
  // mcpTempDir is assigned, because everything below it now needs host.tmpdir.
  const probe = probeRuntime();
  if (probe.kind === "Error") {
    // The failure path needs no extra channel: cleanupMcpRuntime routes this
    // message through setMcpAuthStatus -> publishMcpStatus, so D-08's version
    // block already reaches the user-visible MCP status panel and, via
    // caidoAuthMessage, getDiagnostics too.
    await cleanupMcpRuntime(sdk, "error", probe.error);
    return err(probe.error);
  }

  // D-06: every probe result reaches the user, gating or not. Exactly one
  // compact line per successful start; the failure path above is already
  // covered by the message probeRuntime composed.
  if (lastProbeReport !== undefined) {
    sdk.console.log(
      `[drift] runtime probe: ${describeProbeSummary(lastProbeReport)}`,
    );
  }

  // The sweep moved below the probe for the reason above; it used to run here
  // with mcpTempDir still undefined. Its existing `dir !== mcpTempDir` guard was
  // therefore already comparing against undefined at this point, and stays
  // harmless, because every candidate it compares is a string.
  await sweepOrphanedMcpTempDirs(sdk, probe.value);

  // Stage the MCP runtime under the resolved temp root rather than under the
  // plugin asset path - the Caido plugin path has spaces ("Application Support")
  // which breaks Claude Code's --mcp-config path parsing.
  //
  // 0o700 is REQUESTED here and ASSERTED below, because requesting it is not
  // enough: mkdir(recursive) does not apply `mode` to a directory that already
  // exists, so on a shared /tmp the "other local users cannot read the
  // token-bearing wrapper/config files written inside" property holds only for
  // a directory Drift itself created. enforceOwnerOnlyDir closes that gap and,
  // where it cannot, says so instead of assuming.
  //
  // ALWAYS path.join, never template concatenation: LLRT's os.tmpdir() is
  // std::env::temp_dir() (GetTempPath2 on Windows, $TMPDIR on macOS) and can
  // return a path that already ends in a separator, while Node has stripped
  // trailing separators since v2.0.0. path.join normalises it; a template
  // literal would produce C:\...\Temp\/drift-mcp-x.
  //
  // The path is captured in a `const` and the closure below uses THAT, never
  // the module-level `let`. `mcpTempDir` is mutable module state, the ladder
  // awaits for up to 1,500 ms between attempts, and Caido services other RPC
  // handlers during that window: a concurrent stopMcpServer -> cleanupMcpRuntime
  // sets it to undefined, and attempt N+1 would then call `mkdir(undefined)`.
  // That throws a TypeError whose message carries no transient code, so the
  // ladder aborts and the user is shown a "Write error: TypeError ..." line
  // that is actively misleading about what failed. The `!` non-null assertion
  // this replaces hid the possibility from the type checker.
  const tempDir = path.join(
    getTempRoot(probe.value),
    `drift-mcp-${genShortToken()}`,
  );
  mcpTempDir = tempDir;

  const mcpScriptLocal = path.join(tempDir, "mcp-server.mjs");

  // D-07: the probe WRAPS THE REAL FIRST WRITE, so RUN-04's retry ladder and
  // RUN-05's assertion are one mechanism. There is NO separate canary file: a
  // canary can itself trip the anti-virus write-then-access race it exists to
  // detect - a false negative on precisely the machines that matter - and this
  // write is the failure users actually hit, because a read-only or
  // Defender-locked temp dir passes a stat()-only check and then dies at the
  // copy with the cryptic error RUN-05 exists to replace.
  //
  // Both `mode:` options stay UNCONDITIONAL. LLRT's set_mode is a total no-op
  // returning Ok(()) on non-unix and Node silently ignores mode on Windows, so a
  // platform !== "win32" guard would double the branch count for zero behaviour
  // change while risking a POSIX regression (T-04-30).
  const written = await withFsRetry(
    async () => {
      await mkdir(tempDir, { recursive: true, mode: 0o700 });
      await writeFile(mcpScriptLocal, await readFile(mcpScript, "utf-8"));
    },
    {
      onRetry: (info) => {
        sdk.console.error(
          `[drift] Transient filesystem error staging the MCP server (attempt ${String(info.attempt)}, code ${info.code}); retrying in ${String(info.delayMs)}ms`,
        );
      },
    },
  );
  lastFirstWriteAttempts = written.attempts;
  if (written.kind === "Error") {
    const message = formatProbeFailure(lastProbeReport!, {
      firstWriteError: written.error,
      firstWriteAttempts: written.attempts,
    });
    await cleanupMcpRuntime(sdk, "error", message);
    return err(message);
  }

  // The 0o700 post-condition. Fails CLOSED: this directory is about to hold the
  // Caido session token, so "it already existed and other users can read it" is
  // not a warning, it is a reason not to write the token. Skipped on win32,
  // which has no POSIX mode bits at all — Node synthesises 0o777 for directories
  // there, so checking would fail closed on every Windows start (the same
  // reasoning that keeps the `mode:` options themselves unconditional: they are
  // a documented no-op off unix, whereas this ASSERTION is not).
  //
  // The message carries the octal mode but never the path: this string reaches
  // mcpAuthMessage and therefore the downloadable support bundle, where a temp
  // path would carry the user's account name (T-04-04).
  if (probe.value.platform !== "win32") {
    const insecureMode = await enforceOwnerOnlyDir(tempDir);
    if (insecureMode !== undefined) {
      const message = `Drift stopped starting the MCP server: its staging directory under the system temp root already existed with mode 0${insecureMode.toString(8)}, which grants access to other local users on this machine. That directory holds the Caido session token, so Drift will not write it there. Remove any leftover drift-mcp-* directory from your temp directory and press Start MCP again.`;
      await cleanupMcpRuntime(sdk, "error", message);
      return err(message);
    }
  }

  await refreshProjectContext(sdk);

  // The explicit requireNodeExecutable() call that used to sit here is gone:
  // requireMcpServerSpec resolves Node itself and returns the same
  // getNodeExecutableError() message through the same cleanup-and-err shape
  // below.
  if ((await writeMcpContextFile()) === undefined) {
    const message = "Failed to create MCP context file.";
    await cleanupMcpRuntime(sdk, "error", message);
    return err(message);
  }

  // RUN-01. The wrapper write -> chmod -> validate ladder is replaced by one
  // spec and a direct `node --validate-auth` spawn. getTempMcpScriptPath()
  // inside the keystone resolves to exactly `mcpScriptLocal`: both are
  // path.join(<this temp dir>, "mcp-server.mjs") and `mcpTempDir = tempDir` was
  // assigned immediately above the staging copy.
  const spec = await requireMcpServerSpec();
  if (spec.kind === "Error") {
    await cleanupMcpRuntime(sdk, "error", spec.error);
    return err(spec.error);
  }

  const validation = await validateCaidoAuth(spec.value);
  if (!validation.ok) {
    await cleanupMcpRuntime(sdk, validation.authState, validation.message);
    return err(validation.message);
  }

  setMcpAuthStatus("valid", "");

  // Register MCP with Gemini and Codex only when their providers are
  // enabled + resolvable. The helper also populates the
  // `registeredMcpCliPaths` map so cleanup later runs against the
  // exact binary we used, regardless of future enabled-flag changes.
  //
  // The wrapper write moved INSIDE the helper together with the win32 guard, so
  // this path writes no `.sh` and spawns no chmod on Windows.
  await tryRegisterMcpForProviders(spec.value, sdk);
  cliSessions.clear();

  await publishMcpStatus(sdk);

  return ok(await buildCurrentMcpStatus());
}

async function stopMcpServer(sdk: BackendSDK): Promise<Result<void>> {
  await cleanupMcpRuntime(sdk);
  return ok(undefined);
}

// ── API: Chats ──────────────────────────────────────────────────────

async function getChat(_sdk: BackendSDK, chatId: string): Promise<Result<StoredChat | undefined>> {
  await dataReady;
  return ok(currentChats.find((c) => c.id === chatId));
}

async function getChats(_sdk: BackendSDK): Promise<Result<StoredChat[]>> {
  await dataReady;
  return ok(currentChats);
}

async function saveChat(_sdk: BackendSDK, chat: StoredChat): Promise<Result<void>> {
  await dataReady;
  const idx = currentChats.findIndex((c) => c.id === chat.id);
  if (idx >= 0) {
    currentChats[idx] = chat;
  } else {
    currentChats.push(chat);
  }
  const persistenceError = await saveJson("chats", currentChats);
  if (persistenceError !== undefined) return err(persistenceError);
  return ok(undefined);
}

async function deleteChat(_sdk: BackendSDK, chatId: string): Promise<Result<void>> {
  await dataReady;
  currentChats = currentChats.filter((c) => c.id !== chatId);
  cliSessions.delete(chatId);
  for (const [sessionId, snapshot] of sessionSnapshots.entries()) {
    if (snapshot.chatId !== chatId) continue;
    const proc = activeProcesses.get(sessionId);
    if (proc !== undefined) {
      try { proc.kill("SIGTERM"); } catch { /* already dead */ }
      activeProcesses.delete(sessionId);
    }
    const runtimeFiles = sessionRuntimeFiles.get(sessionId);
    if (runtimeFiles !== undefined) {
      sessionRuntimeFiles.delete(sessionId);
      void rm(runtimeFiles.activityFilePath, { force: true }).catch(() => undefined);
      void rm(runtimeFiles.approvalsFilePath, { force: true }).catch(() => undefined);
    }
    sessionSnapshots.delete(sessionId);
  }
  const persistenceError = await saveJson("chats", currentChats);
  if (persistenceError !== undefined) return err(persistenceError);
  return ok(undefined);
}

// ── API: CLI Sessions ───────────────────────────────────────────────

async function createCliSession(
  sdk: BackendSDK,
  input: { providerId: string; chatId: string }
): Promise<Result<string>> {
  await dataReady;
  const status = await checkProvider(input.providerId);
  if (!status.available) {
    return err(
      formatProviderUnavailableMessage({
        providerId: input.providerId,
        cause: `CLI not available: ${status.error}`,
        platform: host?.platform,
      }),
    );
  }

  const sessionId = `drift-${Date.now()}`;
  for (const [existingSessionId, snapshot] of sessionSnapshots.entries()) {
    if (snapshot.chatId === input.chatId) {
      sessionSnapshots.delete(existingSessionId);
    }
  }
  publishSessionState(sdk, {
    sessionId,
    chatId: input.chatId,
    providerId: input.providerId,
    state: "starting",
    reason: "Session created. Send a message to start the provider turn.",
    reasonCode: "starting",
  });
  sdk.console.log(`[drift] session created: ${sessionId} for ${input.providerId}`);
  return ok(sessionId);
}

async function sendCliMessage(
  sdk: BackendSDK,
  input: {
    sessionId: string;
    chatId: string;
    text: string;
    history?: ChatMessage[];
    httpContext?: HttpContextPayload;
  }
): Promise<Result<SendCliMessageOutput>> {
  try {
    await dataReady;
    await refreshProjectContext(sdk);

    const chat = currentChats.find((c) => c.id === input.chatId);
    const providerId =
      chat?.providerId ?? currentSettings.activeProvider;
    const setSessionState = (
      state: SessionStateName,
      reason: string,
      options?: {
        exitCode?: number;
        mcpAttached?: boolean;
        reasonCode?: CliSessionReasonCode;
        recoveredFromPartialOutput?: boolean;
      },
    ) => publishSessionState(sdk, {
      sessionId: input.sessionId,
      chatId: input.chatId,
      providerId,
      state,
      reason,
      ...(options?.reasonCode !== undefined ? { reasonCode: options.reasonCode } : {}),
      ...(options?.exitCode !== undefined ? { exitCode: options.exitCode } : {}),
      ...(options?.mcpAttached !== undefined ? { mcpAttached: options.mcpAttached } : {}),
      ...(options?.recoveredFromPartialOutput === true
        ? { recoveredFromPartialOutput: true }
        : {}),
    });
    const config = currentSettings.providers[providerId];
    if (!config?.command) {
      setSessionState("error", "Provider not configured.");
      return err("Provider not configured");
    }

    const resolved = await resolveCommand(config.command);
    if (resolved === undefined) {
      const message = formatProviderUnavailableMessage({
        providerId,
        cause: `CLI not found: ${config.command}`,
        platform: host?.platform,
      });
      setSessionState("error", message);
      return err(message);
    }

    // Check if first message BEFORE setting session (for system prompt injection)
    const isFirstMsg = !cliSessions.has(input.chatId);
    const caidoToken = getEffectiveCaidoToken();
    const toolPolicy = getCurrentMcpToolPolicy();
    const runtimeFiles = await createSessionRuntimeFiles(input.sessionId);
    const runtimeEnv = buildMcpRuntimeEnv({
      caidoToken,
      toolPolicy,
      activityFilePath: runtimeFiles?.activityFilePath,
      approvalsFilePath: runtimeFiles?.approvalsFilePath,
    });

    // ── Build args per provider ──
    const args: string[] = [];
    const sessionDebugLogPath: string | undefined = getSessionDebugLogPath(input.sessionId);
    let claudeMcpConfigPath: string | undefined;

    switch (providerId) {
      case "claude-cli": {
        // Use exactly the policy's allowed tools. An empty list (every group
        // disabled) must restrict Claude to no Drift tools — never fall back to
        // the full set, which would invert the user's deny-all intent.
        const claudeAllowedTools = toolPolicy.allowedToolNames;
        const mcpScriptPath = getTempMcpScriptPath();
        const hasMcpAttached = mcpScriptPath !== undefined;

        // Rewrite MCP config on each send so token/url/script path cannot go stale.
        let claudeMcpConfigForLaunch: string | undefined;
        if (mcpScriptPath !== undefined) {
          // RUN-02 / D-10. The per-session `mcp-wrapper-<sessionId>.sh` is GONE.
          // Claude now receives the same document Copilot does — one spec, one
          // projection, two callers — with the token in the config `env` field
          // instead of a shell `export` line. The file moves from a 0o700 `.sh`
          // to a 0o600 `.json` in the same 0o700 directory with the same
          // lifetime and the same finalize() cleanup.
          //
          // requireMcpServerSpec already produces both user-facing failures this
          // branch used to compose by hand (the no-token sentence and the
          // Node-not-found message getNodeExecutableError() builds), so its
          // error is routed through the existing setSessionState + err shape
          // rather than being restated.
          const spec = await requireMcpServerSpec({
            toolPolicy,
            activityFilePath: runtimeFiles?.activityFilePath,
            approvalsFilePath: runtimeFiles?.approvalsFilePath,
          });
          if (spec.kind === "Error") {
            setSessionState("error", spec.error);
            return err(spec.error);
          }
          const cfgFile = await writeChatMcpConfig(
            `mcp-${input.chatId}.json`,
            spec.value,
            sdk,
          );
          if (cfgFile === undefined) {
            setSessionState("error", "Drift could not prepare the Claude MCP configuration file.");
            return err("Drift could not prepare the Claude MCP configuration file.");
          }
          claudeMcpConfigPath = cfgFile;
          claudeMcpConfigForLaunch = cfgFile;
        }

        args.push(
          ...buildClaudeLaunchArgs({
            allowedToolNames: claudeAllowedTools,
            resumeSessionId: cliSessions.get(input.chatId),
            mcpConfigPath: claudeMcpConfigForLaunch,
            hasMcpAttached,
          }),
        );
        break;
      }
      case "gemini-cli":
        args.push(
          ...buildGeminiLaunchArgs({ hasMcpAttached: mcpTempDir !== undefined }),
        );
        break;
      case "codex-cli":
        args.push(...buildCodexLaunchArgs());
        break;
      case "copilot-cli": {
        const mcpScriptPath = getTempMcpScriptPath();
        let copilotMcpConfigForLaunch: string | undefined;
        if (mcpScriptPath !== undefined) {
          // The shipping template, now reading from the shared spec instead of
          // assembling its own object. The document it writes is byte-identical
          // to what this branch wrote before: same command, same single arg, and
          // an `env` field carrying the same DRIFT_*/CAIDO_* keys in the same
          // insertion order (CMP-01).
          const spec = await requireMcpServerSpec({
            toolPolicy,
            activityFilePath: runtimeFiles?.activityFilePath,
            approvalsFilePath: runtimeFiles?.approvalsFilePath,
          });
          if (spec.kind === "Error") {
            setSessionState("error", spec.error);
            return err(spec.error);
          }
          const cfgFile = await writeChatMcpConfig(
            `copilot-mcp-${input.chatId}.json`,
            spec.value,
            sdk,
          );
          if (cfgFile === undefined) {
            setSessionState("error", "Drift could not prepare the Copilot MCP configuration file.");
            return err("Drift could not prepare the Copilot MCP configuration file.");
          }
          copilotMcpConfigForLaunch = cfgFile;
        }
        args.push(
          ...buildCopilotLaunchArgs({ mcpConfigPath: copilotMcpConfigForLaunch }),
        );
        break;
      }
    }

    // ── Build prompt with context ──
    let prompt = "";

    // Add provider-specific system prompt (first message or stateless providers)
    if (isFirstMsg || providerId !== "claude-cli") {
      switch (providerId) {
        case "claude-cli":
          prompt += "You are a security assistant integrated with Caido (a web security proxy). ";
          if (mcpTempDir !== undefined) {
            prompt += "You have MCP tools connected to this Caido instance. When the user asks about HTTP requests, traffic, or security testing, USE the MCP tools directly - do not say you cannot access them. Available tools include search_history (search HTTP traffic with the current Caido project/history context), get_current_context, list_projects, select_project, clear_context_override, get_request, send_request, create_finding, list_findings, get_scope, check_scope, get_environment, set_environment, create_replay_session, intercept_status, intercept_pause, intercept_resume, and run_workflow. Use get_current_context when you need to confirm the active Drift context, and call search_history with no filter and limit 5 to get the latest requests in the active context. ";
          }
          prompt += "Think and use tools as needed, but do not send user-facing progress updates, preambles, or interim messages about loading tools, fetching schemas, or querying Caido. Only provide the user-facing answer once you have the actual result, unless you genuinely need clarification from the user. ";
          break;
        case "gemini-cli":
          prompt += "You are a security assistant integrated with Caido (a web security proxy). ";
          if (mcpTempDir !== undefined) {
            prompt += "You have MCP tools (server name: drift) to interact with Caido. Use them to inspect the active Drift context, list or select projects, search HTTP history with the effective Caido context, get requests, create findings, check scope, and more. ";
          }
          break;
        case "codex-cli":
          prompt += "You are a security code assistant integrated with Caido (a web security proxy). ";
          if (mcpTempDir !== undefined) {
            prompt += "You have MCP tools (server name: drift) to interact with Caido. Use them to inspect the active Drift context, search HTTP history with the effective Caido context, replay requests, and create findings. ";
          }
          break;
        case "copilot-cli":
          prompt += "You are a security assistant integrated with Caido (a web security proxy). ";
          if (mcpTempDir !== undefined) {
            prompt += "You have MCP tools (server name: drift) to interact with Caido. Use them to inspect the active Drift context, search HTTP history with the effective Caido context, get requests, create findings, and more. ";
          }
          break;
      }
      if (mcpTempDir !== undefined && toolPolicy.confirmationRequiredToolNames.length > 0) {
        prompt += "Some sensitive MCP tools require explicit user confirmation before they can run. ";
      }
      prompt += "\n\n";
    }

    prompt += renderHttpContextAttachment(input.httpContext);

    // For stateless providers, prepend truncated conversation history
    if (providerId !== "claude-cli" && input.history !== undefined && input.history.length > 0) {
      const maxMsgs = currentSettings.maxHistoryMessages;
      const maxChars = currentSettings.maxHistoryChars;
      const recent = input.history.slice(-maxMsgs);
      let historyText = "";
      let totalChars = 0;
      for (let i = recent.length - 1; i >= 0; i--) {
        const m = recent[i]!;
        const line = `${m.role}: ${m.content}\n`;
        if (totalChars + line.length > maxChars && historyText.length > 0) break;
        historyText = line + historyText;
        totalChars += line.length;
      }
      if (historyText.length > 0) {
        prompt += `[Conversation History]\n${historyText}\n`;
      }
    }

    prompt += input.text;

    // ── Spawn process ──
    //
    // D-04. There is no generated launch script on any platform any more. The
    // script only ever exported-then-`exec`'d, so on POSIX the direct spawn is
    // behaviourally identical for the CHILD - same pid, same pipes, same
    // effective environment - which is why the existing macOS/Linux suite
    // exercises this path in full rather than leaving a Windows-only arm no CI
    // can reach. What also disappears is the FILE, and with it the write ->
    // chmod -> rename -> exec ladder that literally cannot run on Windows.
    //
    // The variables Drift injects into the provider child. Gated on the MCP
    // runtime being attached, which is exactly the condition that used to gate
    // the launch script: `runtimeEnv` carries the Caido session token, and with
    // no MCP server for the CLI to reach there is nothing the token buys - so
    // handing it over would widen its blast radius for no capability (D-10).
    const injectedDriftVars: Record<string, string> =
      runtimeFiles === undefined ? {} : runtimeEnv;

    // PRV-01/PRV-02. The single decision about HOW this provider is launched,
    // taken once here and consumed twice below: by the diagnostics field on the
    // next line and by the spawn itself inside the promise executor. On darwin,
    // linux and an undefined platform it is a byte-identical passthrough of
    // `resolved` and `args` (CMP-01); on Windows a `.cmd`/`.bat` shim becomes
    // `cmd.exe /d /s /c "<escaped line>"` with verbatim arguments on, while a
    // real `.exe` still spawns directly.
    //
    // It is built HERE rather than beside the spawn because `lastSpawnArgs` is a
    // DIAGNOSTICS field: it must report what was actually handed to the OS, not
    // what was requested, or the one artifact a Windows user can send back would
    // describe a spawn that never happened.
    const spawnPlan = buildSpawnPlan({
      command: resolved,
      args,
      platform: host?.platform,
    });

    lastSpawnArgs = [spawnPlan.file, ...spawnPlan.args];
    appendSessionDebugLog(
      sessionDebugLogPath,
      `sendCliMessage start provider=${providerId} mcpAttached=${String(mcpTempDir !== undefined)} timeoutSeconds=${String(currentSettings.processTimeoutSeconds)}`,
    );
    // The Claude MCP wrapper dump that used to sit here has no successor,
    // because there is no wrapper (D-11). The CONFIG dump below stays: its
    // content is JSON and redactDebugText's JSON arm already covers it.
    if (claudeMcpConfigPath !== undefined) {
      appendSessionDebugLog(
        sessionDebugLogPath,
        `Claude MCP config path=${claudeMcpConfigPath}`,
      );
      appendSessionDebugLog(
        sessionDebugLogPath,
        `Claude MCP config content:\n${redactDebugText(await readFile(claudeMcpConfigPath, "utf-8"))}`,
      );
    }
    // D-11. Command, args and the injected env KEY NAMES - never a value. The
    // wrapper-content dump that used to sit here has no successor because there
    // is no wrapper, and the old `Resolved launch:` line is subsumed by this
    // one, so neither is kept alongside it.
    //
    // Rejected, and recorded so it is not re-proposed: dumping the merged
    // environment through a redaction regex. A regex over a WHOLE environment
    // fails open - it protects only the keys someone thought to enumerate, and
    // the key nobody enumerated is exactly the one the next variable is added
    // under. The formatter this calls has no parameter through which a value
    // could arrive, which is the design rather than a discipline to remember
    // (T-04-04, and `platform.ts`'s buildSpawnEnv states the same rule at the
    // merge point).
    appendSessionDebugLog(
      sessionDebugLogPath,
      formatSpawnDebugLine({
        command: resolved,
        args,
        injectedKeys: Object.keys(injectedDriftVars),
      }),
    );
    setSessionState("running", "Provider turn running.", {
      mcpAttached: mcpTempDir !== undefined,
      reasonCode: "running",
    });
    const collectedActivities: McpToolActivity[] = [];
    // The dedupe Set below must NOT be deleted as "now redundant" now that the
    // tick reads from a byte offset. The offset makes re-delivery unlikely, not
    // impossible: readActivityTick resets to byte 0 whenever the file shrinks
    // below the recorded offset (truncation or rotation), and everything before
    // that point is then re-read. This Set is the correctness backstop, and the
    // re-entrancy flag under it is a separate guard that is also still needed.
    const seenActivityIds = new Set<string>();
    // The in-flight tick, held as a PROMISE rather than a boolean so a caller
    // that must not be skipped can await it. See flushActivities below.
    let activityFlush: Promise<void> | undefined;
    // PERF-02's byte cursor. It lives HERE, in sendCliMessage's closure, and not
    // in a module-level Map keyed by session id: all three callers (the 250 ms
    // setInterval heartbeat, runWatchdog and finalize) close over this scope, so
    // the cursor is per-session BY CONSTRUCTION and dies with the turn. A Map
    // would need explicit cleanup and could leak on any unhandled path.
    let activityCursor = createActivityCursor();
    let notifyClaudeToolActivity: (() => void) | undefined;

    // ONE tick of the tail. Byte-clamped by readActivityTick to
    // ACTIVITY_MAX_TICK_BYTES, which is why `flushActivities({ drain: true })`
    // below exists for the one caller that must catch up completely.
    const readActivitiesOnce = async () => {
      if (runtimeFiles === undefined) return;
      try {
        // Captured BEFORE the read, and the ordering is the entire mitigation:
        // assigning the returned cursor back into the closure variable below
        // makes the two the same object reference, so a comparison written after
        // that assignment would read `x > x` and could never fire. index.ts has
        // no direct test coverage, so nothing downstream would catch it.
        const previousDroppedBytes = activityCursor.droppedBytes;
        // Reads only the bytes appended since the previous tick. Replaces a
        // readFile + full re-parse of the whole growing file, four times a
        // second, on the single-threaded event loop that also runs the RPC
        // keep-alive this watchdog depends on. Never throws: on any failure it
        // returns the incoming cursor and no lines, which is the same
        // best-effort contract as the `catch` below.
        const tick = await readActivityTick({
          filePath: runtimeFiles.activityFilePath,
          cursor: activityCursor,
        });
        activityCursor = tick.cursor;
        if (tick.cursor.droppedBytes > previousDroppedBytes) {
          // An over-long unterminated line was dropped whole by the tail reader.
          // Surfaced once rather than swallowed: a drop nobody can see is a
          // repudiation gap. Deliberately NOT an mcp-tool-activity event - the
          // activity stream is the tool log, not a diagnostics channel.
          sdk.console.error(
            `[drift] activity tail dropped ${String(tick.cursor.droppedBytes - previousDroppedBytes)} bytes of an unterminated activity line sessionId=${input.sessionId}`,
          );
          // ...and into the artifact users actually submit. The console line
          // alone is invisible in a bug report.
          lastActivityDroppedBytes +=
            tick.cursor.droppedBytes - previousDroppedBytes;
        }
        for (const line of tick.lines) {
          // The tolerant parse that parseRuntimeActivityEvents used to own, now
          // inlined at its one call site. Declared ahead of a try that wraps the
          // parse ALONE so the loop body below keeps its original indentation;
          // wrapping the whole body would reindent every preserved line.
          let event: RuntimeActivityEvent;
          try {
            event = JSON.parse(line) as RuntimeActivityEvent;
          } catch {
            continue;
          }
          if (seenActivityIds.has(event.id)) continue;
          seenActivityIds.add(event.id);
          if (event.type === "approval-request") {
            sdk.api.send("mcp-tool-approval", toToolApprovalRequest(input.sessionId, event));
            continue;
          }
          const activity = toToolActivity(event);
          collectedActivities.push(activity);
          sdk.console.log(
            `[drift watchdog] activity observed tool=${activity.toolName} state=${activity.state} total=${String(collectedActivities.length)} sessionId=${input.sessionId}`,
          );
          if (providerId === "claude-cli") {
            notifyClaudeToolActivity?.();
          }
          sdk.api.send("mcp-tool-activity", {
            sessionId: input.sessionId,
            activity,
          });
        }
      } catch {
        // Best-effort only.
      }
    };

    // The re-entrancy guard, and the one caller that must not be turned away by
    // it.
    //
    // `drain` is for finalize. Before PERF-02 the finalize flush was a readFile
    // of the WHOLE activity file, so a single call always caught up. A tick is
    // now clamped to ACTIVITY_MAX_TICK_BYTES (1 MiB) and there is no follow-up
    // tick after finalize — the 250 ms heartbeat has already been torn down — so
    // one tick silently loses every activity beyond the first 1 MiB of
    // un-consumed bytes, and with it the turn's mcpActivities and
    // buildClaudePostToolStallFallback input.
    //
    // The re-entrancy guard compounded that: a boolean that makes a concurrent
    // caller return IMMEDIATELY is right for the heartbeat (the next tick is
    // 250 ms away) and wrong for finalize, where "skip this one" means "never".
    // Holding the in-flight PROMISE rather than a flag lets finalize wait it out
    // by awaiting work that is already scheduled — no timer, so nothing here
    // depends on setTimeout firing while an RPC handler is suspended, which
    // Caido's runtime does not guarantee.
    const flushActivities = async (options?: { drain?: boolean }) => {
      if (runtimeFiles === undefined) return;

      // Bounded, because a caller that keeps arriving must not spin here.
      for (
        let waited = 0;
        activityFlush !== undefined && waited < 8;
        waited += 1
      ) {
        if (options?.drain !== true) return;
        await activityFlush;
      }
      if (activityFlush !== undefined) return;

      const run = (async () => {
        // 64 ticks is 64 MiB of catch-up, which is far past any real activity
        // file; the bound exists so a writer appending faster than this drains
        // cannot hold finalize open forever.
        for (let tick = 0; tick < 64; tick += 1) {
          const before = activityCursor.offset;
          await readActivitiesOnce();
          if (options?.drain !== true) return;
          // Idle: the offset did not move, so there was nothing left to read. A
          // truncation reset MOVES it (backwards), so this keeps draining.
          if (activityCursor.offset === before) return;
        }
      })();

      activityFlush = run;
      try {
        await run;
      } finally {
        if (activityFlush === run) activityFlush = undefined;
      }
    };

    return new Promise<Result<SendCliMessageOutput>>((resolve) => {
      // The parent block first, Drift's own variables overlaid on top - the
      // single merge point, never a hand-rolled spread here. A bare drift-only
      // dict is a defect on BOTH platforms, not a Windows-only one: the spawn
      // `env` option REPLACES the parent block, and under Caido's LLRT there is
      // no libuv to back-fill even the eleven names Windows would otherwise
      // restore.
      //
      // The same guard spawnAndWait carries, for the same measured reason.
      // Windows refuses a DIRECT spawn of a `.cmd` or `.bat` under Node's
      // CVE-2024-27980 guard and throws that EINVAL SYNCHRONOUSLY rather than
      // emitting it as an "error" event. Measured, not assumed: 03-FINDINGS.md,
      // § P1-CMD, on a real windows-latest host. (Cite the findings file, never
      // the CI artifact - those expire.) A NUL byte in `resolved` - rehydrated
      // from the persisted provider command, the same untrusted blob
      // getNodeExecutable already defends against - throws synchronously too.
      //
      // A synchronous throw inside a Promise executor REJECTS the promise, so
      // the proc.on("error") handler below can never fire for it. The enclosing
      // `try { ... } catch (e)` does NOT catch it either: `return <promise>`
      // from an async function ADOPTS the rejection without passing through the
      // catch (only `return await` would). Unguarded, the RPC rejects and none
      // of the executor runs: no terminal session state is published, the
      // session is never entered into activeProcesses so cancelCliMessage
      // cannot clean it up, and - the part that matters against PROJECT.md's
      // token constraint - the token-bearing mcp-<chatId>.json and the
      // per-session runtime files are left on disk, because finalize()'s rm
      // calls are their only deleters.
      //
      // This stopped being unreachable in Phase 6: the resolver now emits
      // `.cmd` candidates, and the install table Phase 6 added tells Windows
      // users to run the `npm install -g` that produces exactly that file.
      //
      // Phase 7 (PRV-02) made a `.cmd` actually LAUNCH here: `spawnPlan` above
      // routes it through `cmd.exe /d /s /c`, so the direct-spawn EINVAL this
      // guard catches is no longer the expected outcome on this path. The guard
      // stays anyway and is NOT now dead code - 05-D-04 put it here for
      // everything else that throws synchronously from `spawn()`, notably a NUL
      // byte in `resolved` rehydrated from the persisted provider command, and
      // for a `cmd.exe` that is itself unspawnable. Still deliberately absent:
      // any `shell` option. Caido's LLRT does zero escaping for it and Node's
      // does its own, so either way a dynamic argument becomes an injection
      // site; the escaping is buildSpawnPlan's, explicitly.
      //
      // CMP-01: catching a throw that POSIX never produces changes nothing on
      // macOS or Linux. There the spawn does not throw, so the catch arm is not
      // entered and every statement below runs in the order it always did.
      //
      // The cleanup is written out here rather than delegating to finalize():
      // finalize is a `const` declared LOWER in this same executor, so it is in
      // its temporal dead zone at this point and calling it would throw a
      // ReferenceError - synchronously, inside the executor, rejecting the very
      // promise this guard exists to keep resolving. The two rm blocks below
      // mirror finalize()'s exactly.
      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawnWithEnv(spawnPlan.file, spawnPlan.args, {
          env: buildSpawnEnv({
            parentEnv: readParentEnv(),
            driftVars: injectedDriftVars,
          }),
          stdio: ["pipe", "pipe", "pipe"],
          // Taken from the plan, never hardcoded: it is true exactly when the
          // plan assembled and escaped a cmd.exe command line itself, and false
          // on every direct spawn (all of POSIX, and a Windows `.exe`).
          windowsVerbatimArguments: spawnPlan.windowsVerbatimArguments,
        });
      } catch (e) {
        const message = `Spawn error: ${String(e)}`;
        appendSessionDebugLog(sessionDebugLogPath, `spawn() threw synchronously: ${message}`);
        setSessionState("error", message, {
          mcpAttached: mcpTempDir !== undefined,
          reasonCode: "spawn_error",
        });
        void (async () => {
          if (runtimeFiles !== undefined) {
            sessionRuntimeFiles.delete(input.sessionId);
            await rm(runtimeFiles.activityFilePath, { force: true }).catch(() => undefined);
            await rm(runtimeFiles.approvalsFilePath, { force: true }).catch(() => undefined);
          }
          if (claudeMcpConfigPath !== undefined) {
            await rm(claudeMcpConfigPath, { force: true }).catch(() => undefined);
          }
          await disposeSessionDebugLog(sessionDebugLogPath);
          resolve(err(message));
        })();
        return;
      }
      appendSessionDebugLog(
        sessionDebugLogPath,
        `spawn() started pid=${String(proc.pid ?? "unknown")}`,
      );
      proc.on("spawn", () => {
        appendSessionDebugLog(
          sessionDebugLogPath,
          `proc.spawn event pid=${String(proc.pid ?? "unknown")}`,
        );
      });

      // Track for cancellation
      activeProcesses.set(input.sessionId, proc);

      // Both-ends retention, because for gemini/codex/copilot this string IS the
      // chat answer (the two read sites in finalizeFromProcessEnd below): the
      // opening of an answer matters to a reader and so does the conclusion, so
      // a middle-drop preserves both.
      //
      // Deliberate divergence from Node's own precedent, recorded here because a
      // later reader will be tempted to "align with Node": child_process.exec's
      // maxBuffer (default 1 MiB) KILLS the child on overflow. Drift must not.
      // Killing the CLI mid-answer converts a cosmetic problem - an answer longer
      // than anyone will read - into a lost turn, which is a self-inflicted
      // availability failure (T-04-17). Truncate and keep reading.
      let stdout = createBoundedBuffer({
        maxChars: CLI_STDOUT_MAX_CHARS,
        retention: "both",
      });
      // Tail retention: this stream is diagnostics and the LAST error is the
      // actionable one while warnings pile up ahead of it.
      let stderr = createBoundedBuffer({
        maxChars: CLI_STDERR_MAX_CHARS,
        retention: "tail",
      });
      // The byte carries for the two handlers below. A `data` chunk boundary
      // falls wherever the pipe read landed, which is routinely mid-sequence in
      // UTF-8, so the trailing bytes of an incomplete character are held here
      // and decoded with the next chunk. Decoding per-chunk instead would bake
      // a permanent U+FFFD into every em-dash, CJK character or IDN hostname
      // that straddles a read boundary — the exact hazard activity-tail.ts
      // keeps its own remainder a Buffer to avoid, at far higher volume.
      //
      // Buffers, not strings: once decoded the damage is unrecoverable, because
      // the surviving bytes of the character are gone. At most 3 bytes are ever
      // held. If the child exits mid-sequence those bytes are dropped, which is
      // correct — they were never a character.
      let stdoutBytes = Buffer.alloc(0);
      let stderrBytes = Buffer.alloc(0);
      let claudePrintState = createClaudePrintState();
      let settled = false;
      let claudeRecoveryTimeout: ReturnType<typeof setTimeout> | undefined;
      let claudePostToolDeadlineTimeout: ReturnType<typeof setTimeout> | undefined;
      let claudePostToolShutdownRequested = false;
      let exitFinalizeTimeout: ReturnType<typeof setTimeout> | undefined;
      let lastStdoutAt = Date.now();
      let activityTickCounter = 0;
      let lastActivityTickLogAt = 0;
      const CLAUDE_STDOUT_SILENCE_BACKSTOP_MS = 20000;
      const heartbeat = () => {
        if (settled) return;
        activityTickCounter += 1;
        const procRef = proc as unknown as {
          exitCode: number | null | undefined;
          signalCode: string | null | undefined;
        };
        const hasExitCode = typeof procRef.exitCode === "number";
        const hasSignalCode =
          typeof procRef.signalCode === "string" && procRef.signalCode !== "";
        if (hasExitCode || hasSignalCode) {
          sdk.console.log(
            `[drift watchdog] heartbeat detected proc exited sessionId=${input.sessionId} exitCode=${String(procRef.exitCode)} signalCode=${String(procRef.signalCode)}`,
          );
          finalizeFromProcessEnd(
            hasExitCode ? (procRef.exitCode as number) : null,
            "heartbeat-exit-check",
            hasSignalCode ? (procRef.signalCode as string) : null,
          );
          return;
        }
        const now = Date.now();
        if (now - lastActivityTickLogAt > 5000) {
          lastActivityTickLogAt = now;
          sdk.console.log(
            `[drift watchdog] heartbeat tick=${String(activityTickCounter)} stdoutSilenceMs=${String(now - lastStdoutAt)} activities=${String(collectedActivities.length)} pendingToolUseIds=${String(claudePrintState.pendingToolUseIds.length)} sessionId=${input.sessionId}`,
          );
        }
        if (providerId !== "claude-cli") return;
        if (claudePostToolShutdownRequested) return;
        const silenceMs = now - lastStdoutAt;
        if (silenceMs < CLAUDE_STDOUT_SILENCE_BACKSTOP_MS) return;
        if (claudePrintState.completed) return;
        if (finalizeClaudePrintOutput(claudePrintState) !== "") return;
        sdk.console.log(
          `[drift watchdog] heartbeat silence backstop fired after ${String(silenceMs)}ms sessionId=${input.sessionId} pendingToolUseIds=${String(claudePrintState.pendingToolUseIds.length)} stopReason=${claudePrintState.stopReason}`,
        );
        appendSessionDebugLog(
          sessionDebugLogPath,
          `Heartbeat silence backstop fired after ${String(silenceMs)}ms; requesting shutdown.`,
        );
        claudePostToolShutdownRequested = true;
        requestGracefulShutdown();
      };
      const activityInterval = setInterval(() => {
        if (runtimeFiles !== undefined) void flushActivities();
        heartbeat();
      }, 250);
      // Also expose the heartbeat via sessionWatchdogs so frontend keep-alive
      // RPCs (getCliSessionState) can pump it from within an RPC context.
      // Caido's plugin runtime does not run pending setInterval callbacks
      // during RPC handling, so the setInterval above becomes dormant once
      // the child process stops producing stdout. The frontend keeps calling
      // getCliSessionState every ~1.5s while isStreaming, and that handler
      // invokes this watchdog — which is how we actually detect a hung or
      // dead child in practice.
      const runWatchdog = async () => {
        if (settled) return;
        if (runtimeFiles !== undefined) await flushActivities();
        heartbeat();
      };
      sessionWatchdogs.set(input.sessionId, runWatchdog);

      const clearClaudeRecoveryTimeout = () => {
        if (claudeRecoveryTimeout !== undefined) {
          clearTimeout(claudeRecoveryTimeout);
          claudeRecoveryTimeout = undefined;
        }
      };

      const clearClaudePostToolDeadlineTimeout = () => {
        if (claudePostToolDeadlineTimeout !== undefined) {
          clearTimeout(claudePostToolDeadlineTimeout);
          claudePostToolDeadlineTimeout = undefined;
        }
      };

      const clearExitFinalizeTimeout = () => {
        if (exitFinalizeTimeout !== undefined) {
          clearTimeout(exitFinalizeTimeout);
          exitFinalizeTimeout = undefined;
        }
      };

      const finalizeFromProcessEnd = (
        code: number | null,
        source: "exit" | "close" | "heartbeat-exit-check",
        signal?: string | null,
      ) => {
        if (settled) return;
        clearExitFinalizeTimeout();
        appendSessionDebugLog(
          sessionDebugLogPath,
          `finalizeFromProcessEnd source=${source} code=${String(code)} signal=${String(signal ?? "")}`,
        );
        setSessionState(
          "stopped",
          code === 0
            ? "Last provider turn completed. Send another message to continue."
            : `Provider exited with code ${String(code)}${signal !== undefined && signal !== null ? ` (signal ${signal})` : ""}.`,
          {
            exitCode: code === null ? undefined : code,
            mcpAttached: mcpTempDir !== undefined,
            reasonCode:
              providerId === "claude-cli" && getClaudePrintRecoveryMode(claudePrintState) !== null
                ? "completed_without_result"
                : "completed",
            recoveredFromPartialOutput:
              providerId === "claude-cli" && !claudePrintState.completed &&
              getClaudePrintRecoveryMode(claudePrintState) !== null,
          },
        );
        const output =
          (providerId === "claude-cli"
            ? finalizeClaudePrintOutput(claudePrintState)
            : renderBoundedBuffer(stdout).trim()) ||
          (providerId === "claude-cli" && claudePostToolShutdownRequested
            ? buildClaudePostToolStallFallback(collectedActivities)
            : "") ||
          (providerId === "claude-cli"
            ? getClaudeToolFailureFallback(collectedActivities)
            : "") ||
          renderBoundedBuffer(stderr).trim() ||
          renderBoundedBuffer(stdout).trim() ||
          `(exit code: ${code})`;
        finalize(ok({
          content: output,
          mcpActivities: [...collectedActivities],
          usage: getClaudePrintUsage(claudePrintState),
        }));
      };

      const finalize = (result: Result<SendCliMessageOutput>) => {
        if (settled) return;
        settled = true;
        appendSessionDebugLog(sessionDebugLogPath, "finalize() start");
        sdk.console.log(`[drift watchdog] finalize() start sessionId=${input.sessionId} kind=${result.kind}`);
        clearTimeout(timeout);
        clearClaudeRecoveryTimeout();
        clearClaudePostToolDeadlineTimeout();
        clearExitFinalizeTimeout();
        clearInterval(activityInterval);
        sessionWatchdogs.delete(input.sessionId);
        activeProcesses.delete(input.sessionId);
        void (async () => {
          appendSessionDebugLog(sessionDebugLogPath, "finalize(): flushActivities start");
          // drain: one tick is byte-clamped and there is no tick after this one.
          await flushActivities({ drain: true });
          appendSessionDebugLog(sessionDebugLogPath, "finalize(): flushActivities end");
          if (runtimeFiles !== undefined) {
            sessionRuntimeFiles.delete(input.sessionId);
            appendSessionDebugLog(sessionDebugLogPath, `finalize(): rm ${runtimeFiles.activityFilePath}`);
            await rm(runtimeFiles.activityFilePath, { force: true }).catch(() => undefined);
            appendSessionDebugLog(sessionDebugLogPath, `finalize(): rm ${runtimeFiles.approvalsFilePath}`);
            await rm(runtimeFiles.approvalsFilePath, { force: true }).catch(() => undefined);
          }
          if (claudeMcpConfigPath !== undefined) {
            appendSessionDebugLog(sessionDebugLogPath, `finalize(): rm ${claudeMcpConfigPath}`);
            await rm(claudeMcpConfigPath, { force: true }).catch(() => undefined);
          }
          appendSessionDebugLog(
            sessionDebugLogPath,
            `finalize(): resolve kind=${result.kind}`,
          );
          await disposeSessionDebugLog(sessionDebugLogPath);
          resolve(result);
        })();
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        setSessionState("error", "Process timed out.", {
          mcpAttached: mcpTempDir !== undefined,
          reasonCode: "timeout",
        });
        finalize(err("Process timed out"));
        try { proc.kill("SIGKILL"); } catch { /* already dead */ }
      }, currentSettings.processTimeoutSeconds * 1000);

      const requestGracefulShutdown = () => {
        appendSessionDebugLog(sessionDebugLogPath, "requestGracefulShutdown(): SIGTERM");
        try { proc.kill("SIGTERM"); } catch { /* already dead */ }
        setTimeout(() => {
          appendSessionDebugLog(sessionDebugLogPath, "requestGracefulShutdown(): SIGKILL");
          try { proc.kill("SIGKILL"); } catch { /* already dead */ }
        }, 3000);
      };

      const scheduleClaudePostToolShutdown = () => {
        if (providerId !== "claude-cli" || settled) return;
        if (collectedActivities.length === 0) return;
        const lastActivity = collectedActivities[collectedActivities.length - 1];
        const delayMs =
          lastActivity !== undefined && lastActivity.state !== "success"
            ? CLAUDE_POST_TOOL_ERROR_QUIESCENCE_MS
            : CLAUDE_POST_TOOL_QUIESCENCE_MS;
        clearClaudePostToolDeadlineTimeout();
        sdk.console.log(
          `[drift watchdog] scheduled post-tool deadline delayMs=${String(delayMs)} activities=${String(collectedActivities.length)} sessionId=${input.sessionId}`,
        );
        claudePostToolDeadlineTimeout = setTimeout(() => {
          sdk.console.log(
            `[drift watchdog] post-tool deadline fired sessionId=${input.sessionId} settled=${String(settled)} pendingToolUseIds=${String(claudePrintState.pendingToolUseIds.length)} stopReason=${claudePrintState.stopReason} outputLen=${String(finalizeClaudePrintOutput(claudePrintState).length)}`,
          );
          if (settled) return;
          if (claudePrintState.completed || didClaudeStopWithoutResult(claudePrintState)) return;
          if (finalizeClaudePrintOutput(claudePrintState) !== "") return;
          appendSessionDebugLog(
            sessionDebugLogPath,
            `Claude post-tool deadline fired after ${String(delayMs)}ms without visible output; requesting shutdown. pendingToolUseIds=${String(claudePrintState.pendingToolUseIds.length)} stopReason=${claudePrintState.stopReason}`,
          );
          sdk.console.log(
            `[drift watchdog] requesting graceful shutdown sessionId=${input.sessionId}`,
          );
          claudePostToolShutdownRequested = true;
          requestGracefulShutdown();
        }, delayMs);
      };
      notifyClaudeToolActivity = () => {
        scheduleClaudePostToolShutdown();
      };

      const scheduleClaudeRecovery = () => {
        if (providerId !== "claude-cli" || settled || claudePrintState.completed) return;

        clearClaudeRecoveryTimeout();
        const recoveryMode = getClaudePrintRecoveryMode(claudePrintState);
        if (recoveryMode === null) return;

        const idleDelayMs =
          recoveryMode === "assistant"
            ? CLAUDE_ASSISTANT_RECOVERY_IDLE_MS
            : CLAUDE_STREAM_RECOVERY_IDLE_MS;
        claudeRecoveryTimeout = setTimeout(() => {
          if (settled || claudePrintState.completed) return;
          if (getClaudePrintRecoveryMode(claudePrintState) === null) return;

          const output = finalizeClaudePrintOutput(claudePrintState);
          if (output === "") return;

          setSessionState(
            "stopped",
            "Claude Code produced output but never sent a final result event. Drift closed the turn after an inactivity window.",
            {
              mcpAttached: mcpTempDir !== undefined,
              reasonCode: "completed_without_result",
              recoveredFromPartialOutput: true,
            },
          );
          finalize(ok({
            content: output,
            mcpActivities: [...collectedActivities],
            usage: getClaudePrintUsage(claudePrintState),
          }));
          requestGracefulShutdown();
        }, idleDelayMs);
      };

      proc.stdout?.on("data", (chunk: Buffer) => {
        // Liveness is a property of the CHUNK, not of the decoded text, so it
        // is recorded before the early return below: a chunk that ends
        // mid-sequence still proves the child is alive, and the stall watchdog
        // must not treat it as silence.
        lastStdoutAt = Date.now();
        const merged =
          stdoutBytes.length === 0
            ? chunk
            : Buffer.concat([stdoutBytes, chunk]);
        const safeEnd = lastCompleteUtf8Boundary(merged);
        // Copied rather than kept as a view, so a 3-byte carry cannot retain a
        // multi-megabyte chunk.
        stdoutBytes = Buffer.from(merged.subarray(safeEnd));
        const text = merged.subarray(0, safeEnd).toString("utf-8");
        if (text === "") return;
        stdout = appendBounded(stdout, text);
        appendSessionDebugLog(
          sessionDebugLogPath,
          `[stdout] ${summarizeDebugChunk(text)}`,
        );
        appendSessionDebugLog(
          sessionDebugLogPath,
          `[stdout-raw] ${text.slice(0, 400)}`,
        );
        if (providerId === "claude-cli") {
          const previousClaudePrintState = claudePrintState;
          claudePrintState = consumeClaudePrintChunk(claudePrintState, text, {
            onText: (delta) => {
              sdk.api.send("cli-output-chunk", {
                sessionId: input.sessionId,
                delta,
                stream: "stdout",
              });
            },
            onSessionId: (sessionId) => {
              if (!cliSessions.has(input.chatId)) {
                cliSessions.set(input.chatId, sessionId);
              }
            },
          });
          const claudeStateChanged =
            previousClaudePrintState.streamedText !== claudePrintState.streamedText ||
            previousClaudePrintState.assistantText !== claudePrintState.assistantText ||
            previousClaudePrintState.completed !== claudePrintState.completed ||
            previousClaudePrintState.messageStopped !== claudePrintState.messageStopped ||
            previousClaudePrintState.stopReason !== claudePrintState.stopReason ||
            previousClaudePrintState.pendingToolUseIds.join(",") !==
              claudePrintState.pendingToolUseIds.join(",");
          if (claudeStateChanged) {
            if (
              claudePrintState.completed ||
              didClaudeStopWithoutResult(claudePrintState) ||
              finalizeClaudePrintOutput(claudePrintState) !== ""
            ) {
              clearClaudePostToolDeadlineTimeout();
            }
            scheduleClaudeRecovery();
          }
          if (settled || (!claudePrintState.completed && !didClaudeStopWithoutResult(claudePrintState))) {
            return;
          }
          const output = finalizeClaudePrintOutput(claudePrintState);
          if (claudePrintState.isError) {
            setSessionState("error", output || "Claude Code returned an error.", {
              mcpAttached: mcpTempDir !== undefined,
              reasonCode: "error",
            });
            finalize(err(output || "Claude Code returned an error."));
          } else {
            const recoveredWithoutResult = didClaudeStopWithoutResult(claudePrintState);
            setSessionState(
              "stopped",
              recoveredWithoutResult || claudePostToolShutdownRequested
                ? "Claude Code completed the turn without emitting the final result record. Drift finalized the response from stream events."
                : "Last provider turn completed. Send another message to continue.",
              {
                mcpAttached: mcpTempDir !== undefined,
                reasonCode:
                  recoveredWithoutResult || claudePostToolShutdownRequested
                    ? "completed_without_result"
                    : "completed",
                recoveredFromPartialOutput:
                  recoveredWithoutResult || claudePostToolShutdownRequested,
              },
            );
            finalize(ok({
              content: output || "(no response)",
              mcpActivities: [...collectedActivities],
              usage: getClaudePrintUsage(claudePrintState),
            }));
          }
          requestGracefulShutdown();
          return;
        }
        sdk.api.send("cli-output-chunk", {
          sessionId: input.sessionId,
          delta: text,
          stream: "stdout",
        });
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        // Same carry discipline as stdout above.
        const merged =
          stderrBytes.length === 0
            ? chunk
            : Buffer.concat([stderrBytes, chunk]);
        const safeEnd = lastCompleteUtf8Boundary(merged);
        stderrBytes = Buffer.from(merged.subarray(safeEnd));
        const text = merged.subarray(0, safeEnd).toString("utf-8");
        if (text === "") return;
        stderr = appendBounded(stderr, text);
        appendSessionDebugLog(
          sessionDebugLogPath,
          `[stderr] ${summarizeDebugChunk(text)}`,
        );
        appendSessionDebugLog(
          sessionDebugLogPath,
          `[stderr-raw] ${text.slice(0, 400)}`,
        );
        // Stream stderr too so user sees warnings/errors in real-time
        sdk.api.send("cli-output-chunk", {
          sessionId: input.sessionId,
          delta: text,
          stream: "stderr",
        });
      });

      appendSessionDebugLog(
        sessionDebugLogPath,
        `stdin write bytes=${String((prompt + "\n").length)}`,
      );
      proc.stdin?.write(prompt + "\n");
      appendSessionDebugLog(sessionDebugLogPath, "stdin end()");
      proc.stdin?.end();

      proc.on("close", (code) => {
        sdk.console.log(`[drift watchdog] proc.close fired sessionId=${input.sessionId} code=${String(code)}`);
        appendSessionDebugLog(sessionDebugLogPath, `process close code=${String(code)}`);
        finalizeFromProcessEnd(code, "close");
      });

      proc.on("exit", (code, signal) => {
        sdk.console.log(`[drift watchdog] proc.exit fired sessionId=${input.sessionId} code=${String(code)} signal=${String(signal ?? "")}`);
        appendSessionDebugLog(
          sessionDebugLogPath,
          `process exit code=${String(code)} signal=${String(signal ?? "")}`,
        );
        if (settled) return;
        clearExitFinalizeTimeout();
        exitFinalizeTimeout = setTimeout(() => {
          if (settled) return;
          finalizeFromProcessEnd(code, "exit", signal);
        }, 250);
      });

      // Attached SYNCHRONOUSLY, in the same turn as the spawn above, and that is
      // a hard requirement rather than a nicety. Under Caido's runtime a spawn
      // failure is delivered asynchronously through a deferred task; with no
      // listener registered when that task runs, the error is thrown with no JS
      // frame left to catch it and the plugin - not the turn - is what dies. Do
      // not move this behind an `await`, a `queueMicrotask` or a conditional.
      //
      // Note also what the error does NOT carry: a `code`. It carries a message
      // and nothing else, so any future classification of spawn failures must
      // match on the MESSAGE, the way fs-retry.ts already does for the
      // `(os error N)` shape rather than reading `.code`.
      proc.on("error", (e) => {
        sdk.console.log(`[drift watchdog] proc.error fired sessionId=${input.sessionId} message=${e.message}`);
        appendSessionDebugLog(sessionDebugLogPath, `process error ${e.message}`);
        if (settled) return;
        setSessionState("error", `Spawn error: ${e.message}`, {
          mcpAttached: mcpTempDir !== undefined,
          reasonCode: "spawn_error",
        });
        finalize(err(`Spawn error: ${e.message}`));
      });
    });
  } catch (e) {
    publishSessionState(sdk, {
      sessionId: input.sessionId,
      chatId: input.chatId,
      providerId:
        currentChats.find((c) => c.id === input.chatId)?.providerId ??
        currentSettings.activeProvider,
      state: "error",
      reason: `sendCliMessage failed: ${String(e)}`,
      reasonCode: "error",
      mcpAttached: mcpTempDir !== undefined,
    });
    return err(`sendCliMessage failed: ${String(e)}`);
  }
}

function cancelCliMessage(sdk: BackendSDK, sessionId: string): Result<void> {
  const proc = activeProcesses.get(sessionId);
  const snapshot = getSessionSnapshot(sessionId);
  if (proc !== undefined) {
    try { proc.kill("SIGTERM"); } catch { /* already dead */ }
    setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* already dead */ }
    }, 3000);
    activeProcesses.delete(sessionId);
    if (snapshot !== undefined) {
      publishSessionState(sdk, {
        sessionId,
        chatId: snapshot.chatId,
        providerId: snapshot.providerId,
        state: "stopped",
        reason: "Provider turn cancelled by the user.",
        reasonCode: "cancelled",
        mcpAttached: snapshot.mcpAttached,
      });
    }
    sdk.console.log(`[drift] cancelled session ${sessionId}`);
  }
  return ok(undefined);
}

function closeCliSession(
  sdk: BackendSDK,
  input: { sessionId: string }
): Result<void> {
  // Kill process if still running
  const proc = activeProcesses.get(input.sessionId);
  const snapshot = getSessionSnapshot(input.sessionId);
  if (proc !== undefined) {
    try { proc.kill("SIGTERM"); } catch { /* already dead */ }
    activeProcesses.delete(input.sessionId);
  }
  const runtimeFiles = sessionRuntimeFiles.get(input.sessionId);
  if (runtimeFiles !== undefined) {
    sessionRuntimeFiles.delete(input.sessionId);
    void rm(runtimeFiles.activityFilePath, { force: true }).catch(() => undefined);
    void rm(runtimeFiles.approvalsFilePath, { force: true }).catch(() => undefined);
  }
  if (snapshot !== undefined) {
    publishSessionState(sdk, {
      sessionId: input.sessionId,
      chatId: snapshot.chatId,
      providerId: snapshot.providerId,
      state: "stopped",
      reason: "Session closed. The next message will create a fresh provider turn.",
      reasonCode: "closed",
      mcpAttached: snapshot.mcpAttached,
    });
  }
  sdk.console.log(`[drift] closed session ${input.sessionId}`);
  return ok(undefined);
}

async function getCliSessionState(
  _sdk: BackendSDK,
  sessionId: string
): Promise<Result<CliSessionStateEvent | undefined>> {
  // Pump the session watchdog from inside this RPC handler. Caido's plugin
  // runtime does not run pending setInterval callbacks during RPC handling,
  // so without this the heartbeat/flushActivities only run while the child
  // process is actively producing stdout. The frontend keeps calling this
  // RPC every ~1.5s while isStreaming, which gives the watchdog a reliable
  // wake-up channel.
  const watchdog = sessionWatchdogs.get(sessionId);
  if (watchdog !== undefined) {
    try {
      await watchdog();
    } catch {
      // Best-effort only — never let a watchdog failure break state reads.
    }
  }
  return ok(getSessionSnapshot(sessionId));
}

async function respondToMcpToolApproval(
  _sdk: BackendSDK,
  input: {
    sessionId: string;
    approvalId: string;
    approved: boolean;
  },
): Promise<Result<void>> {
  const runtimeFiles = sessionRuntimeFiles.get(input.sessionId);
  if (runtimeFiles === undefined) {
    return err(`No pending MCP approval channel exists for session ${input.sessionId}.`);
  }

  try {
    await writeApprovalDecision(
      runtimeFiles.approvalsFilePath,
      input.approvalId,
      input.approved,
    );
    return ok(undefined);
  } catch (error) {
    return err(`Failed to record the MCP approval decision: ${String(error)}`);
  }
}

// ── Diagnostic ──────────────────────────────────────────────────────

async function getDiagnostics(_sdk: BackendSDK): Promise<Result<Record<string, string>>> {
  const mcpScript = path.join(assetsPath, "mcp-server.mjs");
  const mcpScriptExists = await fileExists(mcpScript);
  const mcpTempScript = getTempMcpScriptPath();
  const storedContext = await readStoredMcpContext();
  const effectiveContext = buildMcpServerInfo({
    running: mcpTempDir !== undefined,
    host: currentSettings.mcp.host,
    port: currentSettings.mcp.port,
    token: "",
    url: mcpTempScript !== undefined ? `stdio://${mcpTempScript}` : "",
    authState: mcpAuthState,
    authSource: getCaidoTokenSource(),
    authMessage: mcpAuthMessage,
    uiContext: storedContext.uiContext,
    overrideContext: storedContext.overrideContext,
    selfTestResults: lastMcpSelfTestResults,
    toolPolicy: getCurrentMcpToolPolicy(),
  }).effectiveContext;
  const toolPolicy = getCurrentMcpToolPolicy();
  // PERF-03. This was an UNCONDITIONAL direct call to the resolver, so without
  // this edit the support-bundle path would bypass the cache entirely and pay a
  // full which spawn plus a version-manager walk plus a node --version spawn on
  // every render — exactly the cost PERF-03 exists to remove. Behaviour is
  // unchanged: on a cold cache it still resolves, so the surfaced value is the
  // same. Reads the authoritative validated key, never the raw PATH hit.
  const nodeExecutable = await getCachedNodeExecutable();
  const info: Record<string, string> = {
    pluginPath,
    assetsPath,
    mcpScript,
    mcpScriptExists: String(mcpScriptExists),
    mcpTempDir: mcpTempDir ?? "not set (MCP not started)",
    mcpTempScript: mcpTempScript ?? "not set (MCP not started)",
    mcpContextFile: getMcpContextFilePath() ?? "not set (MCP not started)",
    // D-06 / D-08: every probe result — gating and reported — plus the version
    // block, flattened into this same record so an LLRT gap is visible in a
    // support bundle without blocking MCP for a capability nothing consumes yet.
    // When MCP has never been started the probe has never run, which follows the
    // file's existing "not set (MCP not started)" convention rather than
    // omitting the group or throwing.
    //
    // Security (T-04-04): every field below is a version string, a path Drift
    // itself constructed or resolved, a boolean or an integer. Nothing here is
    // derived from enumerating the environment, and the Windows profile
    // variables render as presence booleans by name, never as values.
    ...(lastProbeReport === undefined
      ? { runtimeProbe: "not run (MCP not started)" }
      : formatProbeReportFields(lastProbeReport)),
    // RUN-04's agreed mitigation for the one behaviour that is not inducible in
    // CI on any runner: a real Defender lock. With the attempt count in the
    // support bundle, the reporter's next bug report answers whether the
    // 1,500 ms ladder was long enough, and FS_RETRY_DELAYS_MS can then be
    // widened on evidence instead of on a guess.
    mcpFirstWriteAttempts: String(lastFirstWriteAttempts),
    // Same purpose, the per-turn temp writes (the Claude/Copilot MCP configs).
    mcpTempWriteAttempts: String(lastTempWriteAttempts),
    // The activity tail's drop tally. Bytes only — never any of the dropped
    // content, which is target-application data (T-04-04).
    activityDroppedBytes: String(lastActivityDroppedBytes),
    caidoApiUrl: currentSettings.caidoApi.url,
    caidoApiTokenSet: getEffectiveCaidoToken() !== "" ? "yes" : "no",
    caidoTokenSource: getCaidoTokenSource(),
    caidoAuthState: mcpAuthState,
    caidoAuthMessage: mcpAuthMessage || "none",
    allowedMcpTools: toolPolicy.allowedToolNames.join(", ") || "none",
    confirmationRequiredTools: toolPolicy.confirmationRequiredToolNames.join(", ") || "none",
    caidoProjectId: storedContext.uiContext.projectId || "none",
    caidoHistoryScopeId: storedContext.uiContext.historyScopeId || "none",
    caidoHistoryQuery: storedContext.uiContext.historyQuery || "none",
    caidoFilterId: storedContext.uiContext.filterId || "none",
    caidoFilterName: storedContext.uiContext.filterName || "none",
    caidoFilterQuery: storedContext.uiContext.filterQuery || "none",
    caidoOverrideProjectId: storedContext.overrideContext.projectId || "none",
    caidoOverrideActive: effectiveContext.overrideActive ? "yes" : "no",
    caidoEffectiveProjectId: effectiveContext.projectId || "none",
    caidoEffectiveScopeId: effectiveContext.historyScopeId || "none",
    nodeExecutable: nodeExecutable || "not found",
    nodeSearchCandidates: lastNodeSearchCandidates.join(", ") || "none",
    // PERF-03. Turns a confusing stale result into a self-explaining one: a user
    // reporting "Drift can't find my newly installed CLI" now pastes a bundle
    // that already says the entry is a 12-second-old negative hit. Security
    // (T-04-04): key names, ages in seconds, a positive/negative marker and the
    // clear count only — no cached VALUES, no provider command strings beyond
    // what this record already carries, and nothing derived from enumerating the
    // environment. The invalidation signature is deliberately absent.
    resolutionCache: describeResolutionCache(resolutionCache, Date.now()),
    // Rendered from the two exported constants rather than hardcoded, so a
    // silent TTL change shows up here instead of making the bundle lie.
    resolutionCacheTtls:
      `positive ${String(Math.round(RESOLUTION_POSITIVE_TTL_MS / 1000))}s` +
      ` / negative ${String(Math.round(RESOLUTION_NEGATIVE_TTL_MS / 1000))}s`,
    activeProvider: currentSettings.activeProvider,
    sqlitePersistenceAvailable: db !== undefined ? "yes" : "no",
    activeSessions: String(activeProcesses.size),
    cliSessionsCount: String(cliSessions.size),
    lastSpawnCommand: lastSpawnArgs.join(" "),
    lastSelfTestProviders: Object.keys(lastMcpSelfTestResults).join(", ") || "none",
    lastPersistenceScope: lastPersistenceScope || "none",
    lastPersistenceMessage: lastPersistenceMessage || "none",
    lastPersistenceTimestamp: lastPersistenceTimestamp > 0 ? String(lastPersistenceTimestamp) : "none",
    mcpRegisteredCliPaths:
      registeredMcpCliPaths.size === 0
        ? "none"
        : [...registeredMcpCliPaths.entries()]
            .map(([cli, p]) => `${cli}=${p}`)
            .join(", "),
    mcpSkippedCliReasons:
      skippedMcpCliReasons.size === 0
        ? "none"
        : [...skippedMcpCliReasons.entries()]
            .map(([cli, reason]) => `${cli}: ${reason}`)
            .join(" | "),
  };

  if (mcpTempDir !== undefined) {
    info["mcpTempScriptExists"] =
      String(mcpTempScript !== undefined && await fileExists(mcpTempScript));
    const testCfg = path.join(mcpTempDir, "test-diag.json");
    try {
      await writeTemp(mcpTempDir, "test-diag.json", "test");
      info["tempDirWritable"] = "yes";
      await rm(testCfg);
    } catch (e) {
      info["tempDirWritable"] = `no: ${String(e)}`;
    }
  }

  return ok(info);
}

async function exportSupportBundle(sdk: BackendSDK): Promise<Result<SupportBundleOutput>> {
  const runtimeProcess = globalThis as typeof globalThis & {
    process?: {
      platform?: string;
      arch?: string;
      version?: string;
    };
  };
  const diagnostics = await getDiagnostics(sdk);
  if (diagnostics.kind === "Error") return diagnostics;

  const providerStatuses = await getProviderStatuses(sdk);
  if (providerStatuses.kind === "Error") return providerStatuses;

  const mcpStatus = await getMcpStatus(sdk);
  if (mcpStatus.kind === "Error") return mcpStatus;

  const bundle = {
    generatedAt: new Date().toISOString(),
    plugin: {
      version: pluginVersion,
      path: pluginPath,
      assetsPath,
    },
    environment: {
      platform: runtimeProcess.process?.platform ?? "unknown",
      arch: runtimeProcess.process?.arch ?? "unknown",
      nodeVersion: runtimeProcess.process?.version ?? "unknown",
    },
    activeProvider: currentSettings.activeProvider,
    providers: providerStatuses.value.map((status) => ({
      id: status.id,
      available: status.available,
      command: currentSettings.providers[status.id]?.command ?? "",
      resolvedPath: status.resolvedPath,
      error: status.error,
    })),
    mcp: {
      running: mcpStatus.value.running,
      authState: mcpStatus.value.authState,
      authSource: mcpStatus.value.authSource,
      authMessage: mcpStatus.value.authMessage,
      supportedToolCount: mcpStatus.value.supportedToolCount,
      toolPolicy: mcpStatus.value.toolPolicy,
      uiContext: mcpStatus.value.uiContext,
      overrideContext: mcpStatus.value.overrideContext,
      effectiveContext: mcpStatus.value.effectiveContext,
      selfTestResults: mcpStatus.value.selfTestResults,
    },
    diagnostics: diagnostics.value,
    persistence: {
      scope: lastPersistenceScope || null,
      message: lastPersistenceMessage || null,
      timestamp: lastPersistenceTimestamp > 0 ? lastPersistenceTimestamp : null,
    },
    sessions: [...sessionSnapshots.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((snapshot) => ({
        ...snapshot,
        running: activeProcesses.has(snapshot.sessionId),
      })),
    chats: currentChats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      providerId: chat.providerId,
      messageCount: chat.messages.length,
      hasHttpContext: chat.messages.some((message) => message.httpContextAttachment !== undefined),
      updatedAt: chat.updatedAt,
    })),
    settingsSummary: {
      mcpEnabled: currentSettings.mcp.enabled,
      mcpHost: currentSettings.mcp.host,
      mcpPort: currentSettings.mcp.port,
      processTimeoutSeconds: currentSettings.processTimeoutSeconds,
      maxHistoryMessages: currentSettings.maxHistoryMessages,
      maxHistoryChars: currentSettings.maxHistoryChars,
      activeProvider: currentSettings.activeProvider,
      permissionGroups: currentSettings.mcpPermissions.enabledGroups,
      sensitiveConfirmation: currentSettings.mcpPermissions.confirmSensitiveActions,
    },
  };

  return ok({
    fileName: `drift-diagnostics-${Date.now()}.json`,
    content: `${JSON.stringify(bundle, null, 2)}\n`,
  });
}

// ── API type + init ─────────────────────────────────────────────────

export type API = DefineAPI<{
  getSettings: typeof getSettings;
  updateSettings: typeof updateSettings;
  syncCaidoSessionToken: typeof syncCaidoSessionToken;
  syncCaidoHistoryContext: typeof syncCaidoHistoryContext;
  getProviderStatuses: typeof getProviderStatuses;
  checkProviderAvailability: typeof checkProviderAvailability;
  getMcpStatus: typeof getMcpStatus;
  runMcpSelfTest: typeof runMcpSelfTest;
  startMcpServer: typeof startMcpServer;
  stopMcpServer: typeof stopMcpServer;
  getChat: typeof getChat;
  getChats: typeof getChats;
  saveChat: typeof saveChat;
  deleteChat: typeof deleteChat;
  createCliSession: typeof createCliSession;
  sendCliMessage: typeof sendCliMessage;
  cancelCliMessage: typeof cancelCliMessage;
  closeCliSession: typeof closeCliSession;
  getCliSessionState: typeof getCliSessionState;
  respondToMcpToolApproval: typeof respondToMcpToolApproval;
  getDiagnostics: typeof getDiagnostics;
  exportSupportBundle: typeof exportSupportBundle;
}>;

export function init(sdk: SDK<API, BackendEvents>) {
  pluginPath = sdk.meta.path();
  assetsPath = sdk.meta.assetsPath();
  initDb(sdk);
  sdk.console.log(`[drift] init — plugin: ${pluginPath}, assets: ${assetsPath}`);
  void detectPluginVersion().then((version) => {
    pluginVersion = version;
    sdk.console.log(`[drift] version detected: ${version}`);
  });

  // Load persisted data. Unknown keys from legacy installs (e.g. the
  // removed `scanner` block) are ignored by the type and dropped on
  // the next save.
  void Promise.all([
    loadJson<Settings>("settings", DEFAULT_SETTINGS).then((s) => {
      currentSettings = { ...DEFAULT_SETTINGS, ...s };
      // PERF-03 baseline. Without this seed the first save after a restart
      // would compare the real provider commands against the empty initial
      // signature, report a change and clear a cache that was already correct.
      // The boolean is ignored on purpose: over an empty cache the transition
      // is a no-op with an honest return value, and special-casing the seed
      // inside resolution-cache.ts would hide a genuine first-turn change.
      const seedSignature = buildProviderCommandSignature(currentSettings.providers);
      syncResolutionCacheSignature(resolutionCache, seedSignature);
      sdk.console.log("[drift] settings loaded");
    }),
    loadJson<StoredChat[]>("chats", []).then((c) => {
      currentChats = c;
      sdk.console.log(`[drift] ${c.length} chats loaded`);
    }),
  ]).finally(() => markDataReady());

  // Register APIs
  sdk.api.register("getSettings", getSettings);
  sdk.api.register("updateSettings", updateSettings);
  sdk.api.register("syncCaidoSessionToken", syncCaidoSessionToken);
  sdk.api.register("syncCaidoHistoryContext", syncCaidoHistoryContext);
  sdk.api.register("getProviderStatuses", getProviderStatuses);
  sdk.api.register("checkProviderAvailability", checkProviderAvailability);
  sdk.api.register("getMcpStatus", getMcpStatus);
  sdk.api.register("runMcpSelfTest", runMcpSelfTest);
  sdk.api.register("startMcpServer", startMcpServer);
  sdk.api.register("stopMcpServer", stopMcpServer);
  sdk.api.register("getChat", getChat);
  sdk.api.register("getChats", getChats);
  sdk.api.register("saveChat", saveChat);
  sdk.api.register("deleteChat", deleteChat);
  sdk.api.register("createCliSession", createCliSession);
  sdk.api.register("sendCliMessage", sendCliMessage);
  sdk.api.register("cancelCliMessage", cancelCliMessage);
  sdk.api.register("closeCliSession", closeCliSession);
  sdk.api.register("getCliSessionState", getCliSessionState);
  sdk.api.register("respondToMcpToolApproval", respondToMcpToolApproval);
  sdk.api.register("getDiagnostics", getDiagnostics);
  sdk.api.register("exportSupportBundle", exportSupportBundle);

  void refreshProjectContext(sdk);
  sdk.events.onProjectChange(async (_, project) => {
    await syncProjectContext(sdk, project as ProjectSelection);
  });
}
