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
  getSweepRoots,
  getTempRoot,
  normalizePlatform,
  type Platform,
} from "./platform";
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

const NODE_EXECUTABLE_ERROR =
  "Drift could not locate a Node.js executable to launch the MCP server. Restart Caido from an environment where Node.js is available.";
const CLAUDE_ASSISTANT_RECOVERY_IDLE_MS = 1500;
const CLAUDE_STREAM_RECOVERY_IDLE_MS = 8000;
const CLAUDE_POST_TOOL_QUIESCENCE_MS = 15000;
const CLAUDE_POST_TOOL_ERROR_QUIESCENCE_MS = 3000;
const DEBUG_CHUNK_PREVIEW_CHARS = 200;

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

async function writeTemp(dir: string, name: string, content: string): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const fp = path.join(dir, name);
  // 0o600: these temp files can carry the Caido token (e.g. the Copilot MCP
  // config embeds it). The 0o700 parent dir already blocks other users, but
  // restrict the file too as defense-in-depth.
  await writeFile(fp, content, { mode: 0o600 });
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

async function writeChatMcpConfig(
  name: string,
  server: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  },
): Promise<string | undefined> {
  if (mcpTempDir === undefined) return undefined;
  if (!(await fileExists(server.command))) return undefined;
  return writeTemp(mcpTempDir, name, JSON.stringify({
    mcpServers: {
      drift: server,
    },
  }, null, 2));
}

async function writeLaunchScript(
  name: string,
  command: string,
  args: string[],
  envVars: Record<string, string>,
): Promise<string | undefined> {
  if (mcpTempDir === undefined) return undefined;
  const scriptPath = path.join(mcpTempDir, name);
  const tempScriptPath = `${scriptPath}.tmp`;
  const content = renderExportExecScript(command, args, envVars);
  // 0o700: launch scripts export the Caido token and must be executable.
  await writeFile(tempScriptPath, content, { mode: 0o700 });
  const chmodResult = await spawnAndWait("chmod", ["+x", tempScriptPath]);
  if (chmodResult.code !== 0) {
    await rm(tempScriptPath, { force: true });
    return undefined;
  }
  await rename(tempScriptPath, scriptPath);
  return scriptPath;
}

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

function buildMcpRuntimeEnv(input: {
  caidoToken: string;
  toolPolicy?: McpToolPolicy;
  activityFilePath?: string;
  approvalsFilePath?: string;
}): Record<string, string> {
  const toolPolicy = input.toolPolicy ?? getCurrentMcpToolPolicy();
  return {
    CAIDO_URL: currentSettings.caidoApi.url,
    CAIDO_TOKEN: input.caidoToken,
    ...(getMcpContextFilePath() !== undefined
      ? { DRIFT_CONTEXT_FILE: getMcpContextFilePath()! }
      : {}),
    // Signals to the MCP server that the allowlist is intentionally configured.
    // With this set, an empty DRIFT_ALLOWED_TOOLS means "deny all" (every group
    // disabled), not "allow all". See getAvailableTools() in mcp-server.mjs.
    DRIFT_ALLOWLIST_ACTIVE: "1",
    DRIFT_ALLOWED_TOOLS: toolPolicy.allowedToolNames.join(","),
    DRIFT_CONFIRMATION_REQUIRED_TOOLS: toolPolicy.confirmationRequiredToolNames.join(","),
    DRIFT_CONFIRM_SENSITIVE_ACTIONS: toolPolicy.confirmSensitiveActions ? "1" : "0",
    ...(input.activityFilePath !== undefined
      ? { DRIFT_ACTIVITY_FILE: input.activityFilePath }
      : {}),
    ...(input.approvalsFilePath !== undefined
      ? { DRIFT_APPROVALS_FILE: input.approvalsFilePath }
      : {}),
  };
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

async function writeMcpWrapper(
  mcpScriptPath: string,
  nodeExecutable: string,
  caidoToken: string,
  options?: {
    name?: string;
    toolPolicy?: McpToolPolicy;
    activityFilePath?: string;
    approvalsFilePath?: string;
  },
): Promise<string | undefined> {
  if (mcpTempDir === undefined) return undefined;
  const wrapperPath = path.join(mcpTempDir, options?.name ?? "mcp-wrapper.sh");
  const tempWrapperPath = `${wrapperPath}.tmp`;
  const runtimeEnv = buildMcpRuntimeEnv({
    caidoToken,
    toolPolicy: options?.toolPolicy,
    activityFilePath: options?.activityFilePath,
    approvalsFilePath: options?.approvalsFilePath,
  });
  await writeFile(
    tempWrapperPath,
    renderExportExecScript(nodeExecutable, [mcpScriptPath], runtimeEnv, {
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

async function validateCaidoAuth(wrapperPath: string): Promise<CaidoValidationResult> {
  const result = await spawnAndWait(wrapperPath, ["--validate-auth"]);
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
  if (path.isAbsolute(command)) {
    return await fileExists(command) ? command : undefined;
  }
  // PERF-03. Everything below — the which/where.exe spawn, the candidate build
  // and the fileExists loop — is the expensive part, and it is unchanged except
  // for being moved into the resolver callback. Date.now() is read HERE and
  // never inside resolution-cache.ts, which is what keeps that module's expiry
  // tests deterministic.
  return await resolveWithCache(resolutionCache, {
    key: `cmd:${command}`,
    now: Date.now(),
    bypass: options?.bypassCache,
    resolve: async () => {
      const pathResolution = await new Promise<string | undefined>((resolve) => {
        const child = spawn("which", [command]);
        // PERF-04 site 7 — the accumulator every earlier inventory in this phase
        // missed, because `grep -n "stdout += "` is structurally blind to a
        // variable named `out`. Bounded rather than EXCLUDED: the tempting
        // exemption ("it is only `which`, the output is one short path, and the
        // 1-second timeout below caps it") is the same argument this phase
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
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { child.kill("SIGKILL"); } catch { /* ignore */ }
          resolve(undefined);
        }, 1000);
        child.stdout?.on("data", (d: Buffer) => { out = appendBounded(out, d.toString()); });
        child.on("close", (code) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          // Read once. Below the cap the rendered value is byte-identical to the
          // string this used to accumulate, so the returned path is unchanged
          // for every real input — a which hit is one short line.
          const resolved = renderBoundedBuffer(out).trim();
          resolve(code === 0 && resolved !== "" ? resolved : undefined);
        });
        child.on("error", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(undefined);
        });
      });

      const candidates = await getCommandExecutableCandidates({
        command,
        pathResolution,
        homeDirs: getKnownHomeDirs(),
      });

      for (const candidate of candidates) {
        if (await fileExists(candidate)) return candidate;
      }

      return undefined;
    },
  });
}

function getKnownHomeDirs(): string[] {
  const processRef = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };

  return [
    processRef.process?.env?.HOME,
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
        error: path.isAbsolute(config.command)
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

  const caidoToken = getEffectiveCaidoToken();
  if (caidoToken === "") {
    const message = "No Caido access token is available. Open any Caido page (or reauthenticate) so Drift can pick up your session, then retry.";
    await cleanupMcpRuntime(sdk, "invalid", message);
    return message;
  }

  const nodeExecutable = await requireNodeExecutable();
  if (nodeExecutable.kind === "Error") {
    await cleanupMcpRuntime(sdk, "error", nodeExecutable.error);
    return nodeExecutable.error;
  }

  if ((await writeMcpContextFile()) === undefined) {
    const message = "Settings were saved, but Drift failed to refresh the MCP context file. Restart the MCP server.";
    await cleanupMcpRuntime(sdk, "error", message);
    return message;
  }

  const wrapperPath = await writeMcpWrapper(mcpScriptPath, nodeExecutable.value, caidoToken);
  if (wrapperPath === undefined) {
    const message = "Settings were saved, but Drift failed to refresh the MCP wrapper. Restart the MCP server.";
    await cleanupMcpRuntime(sdk, "error", message);
    return message;
  }

  const validation = await validateCaidoAuth(wrapperPath);
  if (!validation.ok) {
    await cleanupMcpRuntime(sdk, validation.authState, validation.message);
    return validation.message;
  }

  setMcpAuthStatus("valid", "");
  await tryRegisterMcpForProviders(wrapperPath, sdk);
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

async function callMcpMethod(
  wrapperPath: string,
  request: Record<string, unknown>,
  envVars: Record<string, string> | undefined = undefined,
): Promise<{ response: JsonRpcResponse; durationMs: number }> {
  const requestId = typeof request.id === "number" ? request.id : 2;
  const methodName = typeof request.method === "string" ? request.method : "unknown";
  let launchPath = wrapperPath;
  if (envVars !== undefined && Object.keys(envVars).length > 0) {
    const script = await writeLaunchScript(
      `mcp-self-test-${requestId}.sh`,
      wrapperPath,
      [],
      envVars,
    );
    if (script === undefined) {
      throw new Error("Drift could not prepare the MCP self-test launcher.");
    }
    launchPath = script;
  }

  return new Promise((resolve, reject) => {
    activeSelfTestPoll = undefined;
    const proc = spawn(launchPath, [], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const cleanupLaunchScript = () => {
      if (launchPath !== wrapperPath) {
        void rm(launchPath, { force: true }).catch(() => undefined);
      }
    };

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
      cleanupLaunchScript();
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
      cleanupLaunchScript();
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
      cleanupLaunchScript();
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
  const wrapperPath = getMcpWrapperPath();
  if (wrapperPath === undefined || !(await fileExists(wrapperPath))) {
    const message = "Drift MCP runtime is not running.";
    return { checks: createFailedSelfTestChecks(message), error: message };
  }

  const checks: McpSelfTestCheck[] = [];
  let combinedError = "";
  const selfTestEnv = buildMcpRuntimeEnv({
    caidoToken: getEffectiveCaidoToken(),
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

  try {
    const toolsList = await callMcpMethod(wrapperPath, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }, selfTestEnv);
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
      const response = await callMcpMethod(wrapperPath, {
        jsonrpc: "2.0",
        id: 3 + offset,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolName === "search_history" ? { limit: 1 } : {},
        },
      }, selfTestEnv);
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

function spawnAndWait(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
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
    execPath: processRef.process?.execPath,
    pathResolution: await resolveCommand("node"),
    homeDirs: getKnownHomeDirs(),
    absoluteProviderCommands: Object.values(currentSettings.providers)
      .map((provider) => provider.command)
      .filter((command): command is string => path.isAbsolute(command)),
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
  return await resolveWithCache(resolutionCache, { key: "node", now: Date.now(), resolve: getNodeExecutable });
}

async function requireNodeExecutable(): Promise<Result<string>> {
  // PERF-03, and note the change of CHARACTER: this used to read the module
  // variable lastNodeExecutable, an infinite, never-invalidated cache that
  // survived settings saves, MCP restarts and provider-command changes. Routing
  // it through the shared cache TIGHTENS an existing cache into a bounded one —
  // it does not add caching where there was none.
  const nodeExecutable = await getCachedNodeExecutable();
  if (nodeExecutable === undefined) return err(NODE_EXECUTABLE_ERROR);
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

async function tryRegisterMcpForProviders(mcpScript: string, sdk: BackendSDK): Promise<void> {
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
    await registerMcpWithCli(cli, resolved, mcpScript, sdk);
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
    const message = "No Caido access token is available. Open any Caido page (or reauthenticate) so Drift can pick up your session, then retry.";
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

  const nodeExecutable = await requireNodeExecutable();
  if (nodeExecutable.kind === "Error") {
    await cleanupMcpRuntime(sdk, "error", nodeExecutable.error);
    return err(nodeExecutable.error);
  }

  if ((await writeMcpContextFile()) === undefined) {
    const message = "Failed to create MCP context file.";
    await cleanupMcpRuntime(sdk, "error", message);
    return err(message);
  }

  const wrapperPath = await writeMcpWrapper(mcpScriptLocal, nodeExecutable.value, caidoToken);
  if (wrapperPath === undefined) {
    const message = "Failed to create MCP wrapper script.";
    await cleanupMcpRuntime(sdk, "error", message);
    return err(message);
  }

  const validation = await validateCaidoAuth(wrapperPath);
  if (!validation.ok) {
    await cleanupMcpRuntime(sdk, validation.authState, validation.message);
    return err(validation.message);
  }

  setMcpAuthStatus("valid", "");

  // Register MCP with Gemini and Codex only when their providers are
  // enabled + resolvable. The helper also populates the
  // `registeredMcpCliPaths` map so cleanup later runs against the
  // exact binary we used, regardless of future enabled-flag changes.
  await tryRegisterMcpForProviders(wrapperPath, sdk);
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
    return err(formatProviderUnavailableMessage(input.providerId, `CLI not available: ${status.error}`));
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
      const message = formatProviderUnavailableMessage(
        providerId,
        `CLI not found: ${config.command}`,
      );
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
    let claudeMcpWrapperPath: string | undefined;
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
          if (caidoToken === "") {
            setSessionState("error", "No Caido access token is available for this provider turn.");
            return err("No Caido access token is available. Open any Caido page (or reauthenticate) so Drift can pick up your session, then retry.");
          }
          const nodeExecutable = await requireNodeExecutable();
          if (nodeExecutable.kind === "Error") {
            setSessionState("error", nodeExecutable.error);
            return err(nodeExecutable.error);
          }
          const sessionWrapperPath = await writeMcpWrapper(
            mcpScriptPath,
            nodeExecutable.value,
            caidoToken,
            {
              name: `mcp-wrapper-${input.sessionId}.sh`,
              toolPolicy,
              activityFilePath: runtimeFiles?.activityFilePath,
              approvalsFilePath: runtimeFiles?.approvalsFilePath,
            },
          );
          if (sessionWrapperPath === undefined) {
            setSessionState("error", "Drift could not prepare the Claude MCP wrapper script.");
            return err("Drift could not prepare the Claude MCP wrapper script.");
          }
          const cfgFile = await writeChatMcpConfig(
            `mcp-${input.chatId}.json`,
            {
              command: sessionWrapperPath,
              args: [],
            },
          );
          if (cfgFile === undefined) {
            setSessionState("error", "Drift could not prepare the Claude MCP configuration file.");
            return err("Drift could not prepare the Claude MCP configuration file.");
          }
          claudeMcpWrapperPath = sessionWrapperPath;
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
          if (caidoToken === "") {
            setSessionState("error", "No Caido access token is available for this provider turn.");
            return err("No Caido access token is available. Open any Caido page (or reauthenticate) so Drift can pick up your session, then retry.");
          }
          const nodeExecutable = await requireNodeExecutable();
          if (nodeExecutable.kind === "Error") {
            setSessionState("error", nodeExecutable.error);
            return err(nodeExecutable.error);
          }
          const cfgFile = await writeChatMcpConfig(
            `copilot-mcp-${input.chatId}.json`,
            {
              command: nodeExecutable.value,
              args: [mcpScriptPath],
              env: buildMcpRuntimeEnv({
                caidoToken,
                toolPolicy,
                activityFilePath: runtimeFiles?.activityFilePath,
                approvalsFilePath: runtimeFiles?.approvalsFilePath,
              }),
            },
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
    let launchCommand = resolved;
    let launchArgs = args;
    let launchScriptPreview = "";
    if (runtimeFiles !== undefined) {
      launchScriptPreview = renderExportExecScript(resolved, args, runtimeEnv);
      const launchScriptPath = await writeLaunchScript(
        `provider-launch-${input.sessionId}.sh`,
        resolved,
        args,
        runtimeEnv,
      );
      if (launchScriptPath === undefined) {
        setSessionState("error", "Drift could not prepare the provider launcher with the current MCP runtime settings.");
        return err("Drift could not prepare the provider launcher with the current MCP runtime settings.");
      }
      launchCommand = launchScriptPath;
      launchArgs = [];
    }

    lastSpawnArgs = [launchCommand, ...launchArgs];
    appendSessionDebugLog(
      sessionDebugLogPath,
      `sendCliMessage start provider=${providerId} mcpAttached=${String(mcpTempDir !== undefined)} timeoutSeconds=${String(currentSettings.processTimeoutSeconds)}`,
    );
    if (claudeMcpWrapperPath !== undefined) {
      appendSessionDebugLog(
        sessionDebugLogPath,
        `Claude MCP wrapper path=${claudeMcpWrapperPath}`,
      );
      appendSessionDebugLog(
        sessionDebugLogPath,
        `Claude MCP wrapper content:\n${redactDebugText(await readFile(claudeMcpWrapperPath, "utf-8"))}`,
      );
    }
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
    if (launchScriptPreview !== "") {
      appendSessionDebugLog(
        sessionDebugLogPath,
        `Provider launch script preview:\n${redactDebugText(launchScriptPreview)}`,
      );
    }
    appendSessionDebugLog(
      sessionDebugLogPath,
      `Resolved launch: ${JSON.stringify([launchCommand, ...launchArgs])}`,
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
    let readingActivities = false;
    // PERF-02's byte cursor. It lives HERE, in sendCliMessage's closure, and not
    // in a module-level Map keyed by session id: all three callers (the 250 ms
    // setInterval heartbeat, runWatchdog and finalize) close over this scope, so
    // the cursor is per-session BY CONSTRUCTION and dies with the turn. A Map
    // would need explicit cleanup and could leak on any unhandled path.
    let activityCursor = createActivityCursor();
    let notifyClaudeToolActivity: (() => void) | undefined;

    const flushActivities = async () => {
      if (runtimeFiles === undefined || readingActivities) return;
      readingActivities = true;
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
      } finally {
        readingActivities = false;
      }
    };

    return new Promise<Result<SendCliMessageOutput>>((resolve) => {
      const proc = spawn(launchCommand, launchArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });
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
          await flushActivities();
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
          if (claudeMcpWrapperPath !== undefined) {
            appendSessionDebugLog(sessionDebugLogPath, `finalize(): rm ${claudeMcpWrapperPath}`);
            await rm(claudeMcpWrapperPath, { force: true }).catch(() => undefined);
          }
          if (launchCommand !== resolved) {
            appendSessionDebugLog(sessionDebugLogPath, `finalize(): rm ${launchCommand}`);
            await rm(launchCommand, { force: true }).catch(() => undefined);
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
