import type { DefineAPI, SDK, DefineEvents } from "caido:plugin";
import { readFile, writeFile, open as openFile, stat, mkdir, rm, readdir } from "fs/promises";
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
  isProviderUsable,
  providerMcpApprovalChannel,
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
// The Phase 8 keystone (plan 08-02). Pure, zero-I/O, and the ONLY source of the
// file/args pair for every process-tree termination this file performs. Its own
// module header carries the A1/A6 verdicts the mechanism rests on.
import {
  buildKillTreePlan,
  buildOrphanKillPlan,
  buildPreviousRunOrphanScanPlan,
  buildSessionOrphanScanPlan,
  classifyOrphanScanOutcome,
  hasTrackedProcessExited,
  type KillTreePlan,
  MCP_TEMP_DIR_PREFIX,
  parseOrphanScanPids,
  shouldDetachProviderSpawn,
  shouldReapSessionOrphans,
  type KillRung,
} from "./kill-plan";
import {
  buildSpawnEnv,
  deriveWindowsSystemRoot,
  getSweepRoots,
  getHomeDirCandidates,
  getTempRoot,
  getWhichCommand,
  rankPathSearchHits,
  getWindowsNamedRoots,
  isAbsolutePath,
  isNvmWindowsInstalled,
  normalizePlatform,
  selectComspec,
  type Platform,
} from "./platform";
// The Phase 5 keystone (plan 05-01). Pure, zero-I/O, and the ONLY source of the
// command/args/env triple for every Drift-owned MCP spawn and config document.
// Everything imported here is exercised by mcp-server-spec.test.ts and
// mcp-server-spec.spawn.test.ts — which is the whole point, because index.ts is
// not importable under vitest and nothing in THIS file is test-reachable.
import {
  buildMcpCliRegistrationArgv,
  buildMcpCliRegistrationEnv,
  buildMcpDriftVars,
  buildMcpServerSpec,
  classifyMcpRemoveExit,
  findExpandableEnvKeys,
  formatMcpRemoveFailure,
  formatMcpRemoveFailures,
  formatMcpRemoveUnusable,
  formatMcpSweepBlockedResidual,
  formatSpawnDebugLine,
  planMcpCliRegistration,
  planMcpCliRemoval,
  toMcpConfigDocument,
  type McpCliRemovalScope,
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

// The orphan enumerator's time budget. The POSIX PATH-search number is REUSED
// rather than a third figure invented: both are a short-lived spawn of a
// base-system utility that answers from kernel state, and `pgrep`'s output
// scales with MATCHES (expected 0-3), not with the size of the process table.
//
// An enumeration that has not answered within it is treated as UNAVAILABLE and
// is not retried. That is deliberate: this scan runs on a teardown path, it is
// best-effort by construction, and a retry would double the spawn count there
// for an answer nothing waits on. `classifyOrphanScanOutcome`'s `scan-timeout`
// arm is where that decision is asserted.
const ORPHAN_SCAN_TIMEOUT_MS = POSIX_PATH_SEARCH_TIMEOUT_MS;

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
// How many of Drift's OWN direct `node mcp-server.mjs` spawns are currently
// running. `callMcpMethod` spawns the MCP server directly for the self-test, and
// that child's command line is BYTE-IDENTICAL to the one a provider CLI's MCP
// child carries — so the idle orphan reap's argv pattern selects it too. At
// teardown that is correct: everything must die. At an IDLE reap it is not, and
// killing it would surface to the user as a self-test failure with no visible
// cause (T-08-28).
//
// A COUNTER AND NOT A PID EXCLUSION LIST, deliberately. A stale pid in such a
// list would shield a genuine orphan that later reused the number — T-08-04's
// failure shape pointed the wrong way. A counter cannot go stale in that
// direction: if a release never runs (Caido's runtime does not reliably deliver
// child_process callbacks while an RPC is awaiting) the depth stays POSITIVE and
// the idle reap is SUPPRESSED. That is the safe direction, and it is the same
// rule `hasTrackedProcessExited` and `isPidAlive` already follow — every unknown
// in this phase resolves toward NOT killing.
// CORRECTION, 2026-08-27 (review CR-01). The paragraph above states what this
// counter is FOR. It did not state what it COVERED. Until this fix the one
// increment sat inside `callMcpMethod` alone, while THREE Drift-owned spawns
// carry an argv the reaper's pattern selects:
//
//   1. `callMcpMethod`'s self-test child — `node <mcpTempDir>/mcp-server.mjs`.
//   2. `validateCaidoAuth`'s child — that same argv plus one trailing
//      `--validate-auth`, reached from EVERY settings save and EVERY effective
//      token change (`refreshActiveMcpRuntime`), and alive for the length of a
//      GraphQL round trip to Caido.
//   3. The `gemini`/`codex` `mcp add` registration child, which carries
//      `<mcpTempDir>/mcp-server.mjs` as a POSITIONAL in its own command line
//      (`buildMcpCliRegistrationArgv`, mcp-server-spec.ts).
//
// Sites 2 and 3 were uncounted, and site 2's failure arm is the expensive one: a
// turn ending while a settings save was in flight opened the idle gate on
// Drift's OWN auth probe, `kill -KILL` took it mid-request, `validateCaidoAuth`
// read the empty output as a generic failure and `refreshActiveMcpRuntime`
// called `cleanupMcpRuntime` — Drift tearing down its entire MCP runtime because
// the user clicked Stop. The counter now covers the CLASS rather than one member
// of it, through the two mutators below and nowhere else.
let mcpDirectCallDepth = 0;

// THE ONLY TWO STATEMENTS THAT MOVE THE COUNTER. They are functions rather than
// inline arithmetic so the class above has exactly ONE spelling in each
// direction: `index.source.test.ts` asserts `mcpDirectCallDepth += 1` and its
// release each appear exactly once in this file, which is the machine form of
// the claim. A fourth direct spawn cannot raise the depth by writing its own
// arithmetic without turning that gate red.
function acquireDirectMcpCall(): void {
  mcpDirectCallDepth += 1;
}

// CLAMPED AT ZERO (review WR-01), and the clamp is load-bearing rather than
// defensive padding. `cleanupMcpRuntime` resets this counter to 0, and a release
// that arrives AFTER such a reset — a `close` for a self-test child that was
// killed by the teardown, an `mcp add` whose await was still unwinding — would
// otherwise drive the depth NEGATIVE. `shouldReapSessionOrphans` demands an
// EXACT zero, so a negative depth suppresses every idle reap for the rest of the
// plugin load: the same permanent disablement the reset exists to prevent,
// reintroduced by the reset itself.
function releaseDirectMcpCall(): void {
  mcpDirectCallDepth = Math.max(0, mcpDirectCallDepth - 1);
}

// The guard for a direct MCP spawn Drift AWAITS, as distinct from the one it
// watches through events. `spawnAndWait` never rejects — it RESOLVES carrying
// the exit code, including for a spawn that never started — so the `finally`
// below is reached on every path this helper can take. That makes the release
// here STRONGER than `callMcpMethod`'s event-bound one: it does not depend on a
// `close` Caido's runtime may not deliver while an RPC is awaiting.
//
// Every `spawnAndWait` whose argv carries the MCP server script path must go
// through here. That is not a convention: the census in `index.source.test.ts`
// counts the `spec.args` and `addPlan.args` occurrences per enclosing function
// and balances them against the file total, so a fourth such spawn added
// outside this helper goes red.
async function withDirectMcpCall<T>(run: () => Promise<T>): Promise<T> {
  acquireDirectMcpCall();
  try {
    return await run();
  } finally {
    releaseDirectMcpCall();
  }
}

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
// THIS RETURNS AN EMPTY RECORD ON EVERY REAL CAIDO INSTALL. That is a
// measurement, not a caveat: the 2026-08-27 diagnostics from a shipping install
// report `parentEnvKeyCount: 0`, with `parentEnvPathEntryCount: absent`. It
// arrives alongside three other absences from the same restricted `process`
// shim — `process.kill`, `process.version` and `process.versions` are all
// missing too. Four absences are a sandbox POLICY rather than a host quirk, and
// a policy is very unlikely to differ by platform, so the emptiness is expected
// to hold on Windows as well. The reading was taken on darwin; the Windows
// consequence is UNMEASURED and stays that way until Phase 9's first
// `windows-latest` leg.
//
// THE SCOPE RULE, in one sentence, because every consumer below inherits that
// emptiness and they do not all inherit the same severity: a consumer of this
// function is a SECURITY defect when its empty-environment outcome is a BARE
// EXECUTABLE NAME resolved through Windows' search order, and a FUNCTIONALITY
// degradation when the outcome is a missing candidate path or a missing
// variable. The first is spoofable (T-08-03); the second is a worse user
// experience.
//
// FIXED, plan 08-08 — the three whose outcome was a bare name, all closed by one
// derived root that does not come from here (`getWindowsSystemRootFallback`):
//   * selectComspec       → cmd.exe      (T-08-33; Phase 7 CR-01, the branch
//                                         that carries a live CAIDO_TOKEN)
//   * getWhichCommand     → where.exe    (T-08-34)
//   * buildKillTreePlan   → taskkill.exe (T-08-03, the reported gap G-01)
//
// RESIDUALS, recorded with owners rather than silently dropped — neither
// resolves a bare name, so neither is a spoofing surface:
//   * getWindowsNamedRoots / isNvmWindowsInstalled → fewer absolute candidate
//     paths for command resolution. Owner: PHASE 10 (Windows Polish /
//     not-on-PATH detection), which already owns that user-visible symptom.
//   * buildSpawnEnv({ parentEnv }) → a spawned child receives only Drift's own
//     variables. Owner: PHASE 9, where the first Windows leg runs; it needs a
//     real reading rather than a code change, and it demonstrably works on
//     macOS today on the same install that reported the empty environment.
//
// `index.source.test.ts` pins the consumer census, so a NEW consumer cannot be
// added without moving a count and forcing that scope question to be answered.
//
// No consumer renders a value, and this function must never be used to log one
// (T-04-04).
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

// The Windows system root, for the three consumers whose environment-sourced
// root is EMPTY on every real install (G-01).
//
// SYNCHRONOUS by requirement, not by preference: `killTree` is synchronous by
// construction — it is called from `cancelCliMessage`, whose signature recorded
// decision OQ-4 fixes — so it cannot await a fallback lookup.
//
// `host` is the CACHED RUN-05 probe value, so this is a property read rather
// than a second `os` call: Phase 4 D-02 gives `probeRuntime` the backend's one
// guarded `os` read and that rule is unchanged here. Before the probe runs
// `host` is `undefined` and this returns the empty string, which lands the
// consumers on the same bare-name last resort they reach today.
//
// The value is DATA for a spawn and is never rendered: `readParentEnv`'s
// contract forbids logging an environment value, and a system path derived at
// the same boundary is one, by the same T-04-04 reasoning `getComspec`'s comment
// below already states.
function getWindowsSystemRootFallback(): string {
  return deriveWindowsSystemRoot({ tmpdir: host?.tmpdir });
}

// The absolute Windows interpreter that EVERY buildSpawnPlan call site passes.
//
// The split is the one getNodeExecutable already uses for `roots` and
// `nvmWindowsInstalled`: the environment is read HERE, at the I/O boundary, and
// the choice is made by a pure function in platform.ts that can be asserted from
// literal inputs. spawn-plan.ts's header states the environment read is the
// caller's job; this is the caller doing it.
//
// Not optional, and not a tidy-up. Without it `buildSpawnPlan` falls back to the
// bare name "cmd.exe", which Windows resolves through a search order that
// includes the working directory Caido's plugin host chose - on the one branch
// that carries a live Caido session token into a spawn (CR-01). Every new
// buildSpawnPlan call site must pass this; index.source.test.ts counts them.
//
// The value is handed to a spawn and never rendered: readParentEnv's contract
// forbids logging an environment value, and an interpreter path is one.
function getComspec(): string | undefined {
  return selectComspec({
    env: readParentEnv(),
    platform: host?.platform,
    // G-01. The environment above is EMPTY on a real install, which made this
    // whole mitigation inert: `selectComspec` found no COMSPEC, returned
    // undefined, and `buildSpawnPlan` fell back to the bare "cmd.exe" — the
    // search-order hole CR-01 closed, reopened by the runtime rather than by an
    // edit. This is the spawn that carries CAIDO_TOKEN (T-08-33).
    systemRootFallback: getWindowsSystemRootFallback(),
  });
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
  // `spec.command` is the absolute `node` path the CLI will execute. It was the
  // shared POSIX wrapper script until Phase 5 replaced it here and Phase 7
  // deleted that wrapper outright.
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
    // The shell arm. Drift itself no longer writes `export CAIDO_TOKEN='...'`
    // anywhere — Phase 7 (PRV-03) deleted the last wrapper that did — but this
    // arm is KEPT, and deliberately so. Debug text is whatever a spawned CLI
    // prints, and a CLI that echoes a shell-shaped line back at Drift is not
    // something Drift controls. Narrowing a redactor as cosmetic cleanup is the
    // wrong direction: a redactor that no longer covers a shape that can still
    // appear fails OPEN, and the failure is a token in a support bundle.
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
      // 0o600: this file carries the project id, the history filter and the
      // context override. It is the site gap G-05 was filed against, observed on
      // disk at 0644. The owner-only parent already blocks other local users, so
      // this is the second layer — and it is the one that survives a temp directory
      // that ALREADY EXISTED, because `mkdir` with `recursive` does not apply a
      // mode to a directory it did not create, and the post-creation assertion
      // that covers that case is skipped on win32.
      //
      // Unconditional, with no platform guard (T-04-30): LLRT's set_mode is a
      // total no-op off unix and Node silently ignores mode on Windows, so a
      // guard would double the branch count for zero behaviour change while
      // risking a POSIX regression.
      await writeFile(
        contextFilePath,
        serializeMcpRuntimeContext(currentCaidoHistoryContext, currentCaidoContextOverride),
        { mode: 0o600 },
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
  // 0o600 on both, and the two files carry DIFFERENT risks rather than one
  // shared one. The activity log carries tool activity drawn from the user's
  // own Caido history, so its risk is disclosure. The approvals file's risk is
  // the WRITE side rather than the read side: `mcp-server.mjs` polls this file
  // synchronously before it executes a sensitive tool, so another local user
  // able to write it could PRE-APPROVE one. Unconditional, per T-04-30.
  await writeFile(activityFilePath, "", { mode: 0o600 });
  await writeFile(approvalsFilePath, "{}\n", { mode: 0o600 });
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
  // 0o600, matching the create in createSessionRuntimeFiles. Stated at the
  // rewrite as well as at the create because this call REPLACES the file's
  // contents on every decision, and a mode stated only once would not survive a
  // runtime whose write unlinks first. Same WRITE-side risk as the create: a
  // locally writable approvals file is a pre-approval channel for a sensitive
  // MCP tool. Unconditional, per T-04-30.
  await writeFile(approvalsFilePath, `${JSON.stringify(current, null, 2)}\n`, {
    mode: 0o600,
  });
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

// HLT-01. Spawns `node mcp-server.mjs --validate-auth` DIRECTLY, with the env
// handed to the child through the spawn option rather than through a wrapper
// script's `export` lines. Everything below the spawn — the JSON parse, the
// AUTHORIZATION/INVALID_TOKEN classification and the two fallbacks — is
// unchanged, because the transport changed and the protocol did not.
async function validateCaidoAuth(spec: McpServerSpec): Promise<CaidoValidationResult> {
  // GUARDED (CR-01). This argv is `node <mcpTempDir>/mcp-server.mjs
  // --validate-auth` — byte-identical to `callMcpMethod`'s child plus one
  // trailing flag — so the idle orphan reap selects it. Unguarded, a turn ending
  // inside this await got the probe SIGKILLed and the empty output read back as
  // a failed validation, whose arm tears down the whole MCP runtime.
  const result = await withDirectMcpCall(() =>
    spawnAndWait(spec.command, [...spec.args, "--validate-auth"], {
      env: spec.env,
    }),
  );
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
        // G-01. The environment above is EMPTY on a real install, so without
        // this rung the win32 arm resolves a BARE "where.exe" through Windows'
        // search order (T-08-34). Required member: the compiler forces every
        // call site to state an answer.
        systemRootFallback: getWindowsSystemRootFallback(),
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
        // Outside the interpreter plan's scope by construction, so a future
        // site inventory does not count it as a missed one: this spawn's target
        // is `which` or `where.exe`, a real executable on either platform, and
        // `buildSpawnPlan` is a passthrough for those.
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
        // RESIDUAL, owner PHASE 10 (G-01). That record is EMPTY on a real
        // install, so both of these read nothing: the outcome is FEWER absolute
        // candidate paths, and a Windows user with nvm or fnm may be told a
        // command is unresolvable. That is a functionality degradation, NOT a
        // bare name resolved through a search order — which is why plan 08-08
        // fixed the three consumers whose outcome WAS a bare name and left
        // these two to the phase that already owns the not-on-PATH symptom.
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
    return { id, capability: "unavailable", error: "Disabled" };
  }
  const resolved = await resolveCommand(config.command, options);
  if (resolved === undefined) {
      // The two error strings below are the precise per-case diagnostics UX-01
      // deliberately does NOT duplicate in the UI (a frontend validator would be
      // weaker and would contradict them). They are byte-unchanged; only the
      // capability field moved.
      return {
        id,
        capability: "unavailable",
        error: isAbsolutePath({
          value: config.command,
          platform: host?.platform,
        })
          ? `"${config.command}" does not exist`
          : `"${config.command}" not found in PATH or common install locations`,
      };
    }
    return applyProviderLimitation({ id, capability: "available", resolvedPath: resolved });
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
  // written registration. Clearing after it would register from exactly the
  // stale entry this invalidation exists to prevent, and the frontend pushes the
  // WHOLE settings object, so that branch is taken on every save from the UI.
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
        `Settings were saved, but Drift failed to refresh the MCP runtime: ${String(e)}`;
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
  // part of its keep-alive. Before Phase 5 this refresh went through the POSIX
  // launch script, which is why the first token refresh on Windows used to tear
  // down a working MCP runtime through the cleanupMcpRuntime call below. That
  // script no longer exists on any platform; the refresh rebuilds the spec.
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
//
// `detached` is REQUIRED for exactly the same reason, one phase later (Phase 8,
// LIF-02 / T-08-11). It decides whether a spawned child gets its own process
// group, which is the difference between a cancel that reaches the
// token-bearing MCP grandchild and one that leaves it running — and, at the two
// Drift-OWNED leaf spawns, the difference between a helper that dies with Drift
// and one that outlives it. An optional flag here would be a default that is
// silently wrong at the one site that forgot it, in either direction. Required
// makes forgetting a compile error and forces all three call sites to state
// their answer out loud; index.source.test.ts then asserts that exactly one of
// them says anything other than false.
type SpawnWithEnv = (
  command: string,
  args: string[],
  options: Record<"env", Record<string, string>> & {
    stdio: ["pipe", "pipe", "pipe"];
    windowsVerbatimArguments: boolean;
    detached: boolean;
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
      //
      // RESIDUAL, owner PHASE 9 (G-01). That record is EMPTY on a real install,
      // so the merge contributes nothing and the child receives only Drift's own
      // variables. No bare name is resolved and no search order is consulted, so
      // this is a BEHAVIOURAL question rather than the spoofing surface plan
      // 08-08 closed — and it needs a real `windows-latest` reading rather than
      // a code change, which is Phase 9's first leg. It demonstrably works on
      // macOS today: 18 tools registered and `authState: valid` on the very
      // install that reported the empty environment.
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
      // FALSE, and a statement rather than a placeholder (LIF-02 / T-08-11).
      // This is a Drift-OWNED leaf: a short-lived `node mcp-server.mjs` that
      // answers one JSON-RPC request for the self-test. It must stay inside
      // Drift's own process group so it dies with Drift; a detached leaf would
      // survive a hard-killed Caido holding a live session token, which is the
      // orphan class this phase exists to remove, reintroduced one layer down.
      detached: false,
    });

    // THE ONE INCREMENT, immediately after the spawn RETURNS — not before it.
    // `spawnWithEnv` throws synchronously for an unspawnable file, and a throw
    // above this line means no process exists to protect; placing the increment
    // here means such a throw leaks nothing, because the counter was never
    // raised.
    acquireDirectMcpCall();
    // THE ONE RELEASE, guarded so the arithmetic has exactly one site in each
    // direction. Called from BOTH the `close` and the `error` handler below,
    // because either can be the last thing this child does and neither is
    // guaranteed to fire.
    //
    // NOT called at the settle paths, and that is the whole distinction: this
    // counter measures THE PROCESS'S OWN END, not the promise's. `finish()`
    // settles the promise and only then asks the child to exit, and the timeout
    // arm settles while the child is still being SIGKILLed — releasing at either
    // would open the idle gate on a process that is still in the table and still
    // matches the reaper's argv pattern.
    //
    // If the release never runs, the depth stays positive and the idle reap is
    // suppressed for the rest of this Caido session. That is the intended
    // failure direction: a suppressed reap leaves an orphan for the NEXT
    // start-up sweep to collect, while a wrongly-released one kills a live
    // self-test.
    let directCallReleased = false;
    const releaseDirectCall = (): void => {
      if (directCallReleased) return;
      directCallReleased = true;
      releaseDirectMcpCall();
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
      // Released FIRST, unconditionally, and before `finish`'s settled guard can
      // return early. An `error` means this child will never run, so the depth
      // it reserved must come back whether or not the promise is still pending.
      releaseDirectCall();
      finish(() => reject(error));
    });

    // THE THIRD RELEASE HANDLER, and the one that matters on the runtime this
    // plugin actually ships to (review WR-01). `close` and `error` are both
    // events CLAUDE.md and this function's own comment forty lines below record
    // as unreliably delivered while an outer RPC is awaiting — which is exactly
    // the window `runMcpSelfTest` holds open across three sequential
    // `callMcpMethod`s per provider. `exit` is the event `kill-plan.ts` names as
    // the one LLRT DOES supply on the handle (`lib.rs`'s `emit_str(…, "exit",
    // …)`), and the one `sendCliMessage`'s provider spawn already registers
    // alongside `close`. `releaseDirectCall()` is idempotent, so a runtime that
    // delivers both releases once.
    //
    // WHY THIS IS NOT COSMETIC. The counter is module-level and, before the
    // reset added to `cleanupMcpRuntime` below, was never zeroed: ONE undelivered
    // `close` on ONE self-test child left the depth at >=1 and closed the idle
    // gate at all four sites — cancel, close, delete and turn end — for the whole
    // life of the plugin load, silently regressing LIF-02. The first thing a user
    // is likely to do, the "Run preflight" button, is what armed it.
    proc.on("exit", () => {
      releaseDirectCall();
    });

    proc.on("close", () => {
      // Released FIRST, ABOVE the `settled` early return. `close` is the
      // process's actual end, and it fires for a child whose promise the timeout
      // arm already settled — returning early there without releasing would
      // strand the depth at 1 and suppress every later idle reap.
      releaseDirectCall();
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
  const targetProviderIds = candidateProviderIds.filter((_, index) => isProviderUsable(providerStatuses[index]));

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
    const cliReady = isProviderUsable(providerStatus);
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
// `spawned` (WR-05) is the discriminator the exit code cannot carry. This helper
// resolves a SYNTHETIC `code: 1` for a spawn that threw or emitted `error`, so
// "the process ran and exited 1" and "there was never a process" arrive at every
// caller as the same value. That is harmless for the callers that only want a
// pass/fail, and it was a defect for the MCP removal classifier, which turned a
// spawn that never started into "a Caido session token may remain" on the
// provider card at EVERY start. The flag is additive: it is `true` on the close
// path and `false` on the two failure paths, and no existing caller had to change.
function spawnAndWait(
  cmd: string,
  args: string[],
  options?: { env?: Record<string, string>; windowsVerbatimArguments?: boolean },
): Promise<{ code: number; stdout: string; stderr: string; spawned: boolean }> {
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
    // launchable. A `.cmd` Windows refuses still resolves as exit code 1 here.
    //
    // That is a DECISION, recorded (07-01 OQ-3), not an unfinished edge. PRV-02
    // landed: `buildSpawnPlan` routes a `.cmd`/`.bat` through `cmd.exe /d /s /c`
    // with verbatim arguments on, and it is applied at the CALL SITES — the
    // provider launch and the three MCP registration/removal loops — never
    // inside this helper. Applying it here would silently capture every other
    // caller, notably `getNodeExecutable`'s `--version` candidate loop and the
    // `where.exe` path search, adding a process-tree level to spawns that do not
    // need one and paying for it twice: once in LIF-01's tree termination
    // (Phase 8) and once in UX-04's console-window count (Phase 10). Both of
    // those sites keep exactly the behaviour they have; the decision is written
    // at each of them.
    //
    // So no shell option, no interpreter wrapper and no extension check belong
    // in this helper — not because nobody has designed them yet, but because the
    // callers that need them already pass a plan and the callers that do not
    // must not be given one by accident.
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
              // FALSE, and a statement rather than a placeholder (LIF-02 /
              // T-08-11). Every caller of this helper AWAITS it: a `--version`
              // probe, a `where.exe` search, an `mcp add`/`mcp remove`. They are
              // Drift-owned leaves that must die with Drift, and detaching one
              // would leave it running past a hard-killed Caido. The bare-spawn
              // arm above deliberately says nothing: `detached` is not in the
              // vendored SpawnOptions and must not be added there.
              detached: false,
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
        // No process exists. The code is this helper's own invention, not an
        // exit status, and a caller that treats the two alike will draw a
        // conclusion the OS never supported (WR-05).
        spawned: false,
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
        // The ONLY path on which the code is a real exit status.
        spawned: true,
      }),
    );
    proc.on("error", () =>
      resolve({
        code: 1,
        stdout: renderBoundedBuffer(stdout),
        stderr: renderBoundedBuffer(stderr),
        // Same synthetic code as the catch arm above, same reason.
        spawned: false,
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
    // RESIDUAL, owner PHASE 10 (G-01) — the second site of the same pair. Empty
    // on a real install, so the outcome is fewer absolute candidate paths for
    // the node lookup, never a bare name executed. See readParentEnv's header
    // for the in-scope/out-of-scope rule this is an application of.
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

  // DECISION (07-01 OQ-3), not a known limitation — the difference matters,
  // because a later reader should not "fix" this.
  //
  // A shim-shaped node candidate (`node.cmd` under a Windows version manager)
  // resolves here as a non-zero exit and is stepped past, and the loop moves on
  // to the next candidate. That is graceful degradation, and it is deliberately
  // NOT launchability: routing the node binary itself through `buildSpawnPlan`'s
  // interpreter branch would add a `cmd.exe` level to EVERY Drift MCP spawn —
  // a cost LIF-01's process-tree termination (Phase 8) and UX-04's
  // console-window count (Phase 10) both pay — in exchange for the single case
  // of a user whose ONLY node is a shim with no real executable beside it. The
  // candidate ladder already prefers the real executable when one exists.
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
// Reasons each CLI was skipped during the last register attempt. Written by
// tryRegisterMcpForProviders.
//
// D-08 — THE MEANING OF AN ENTRY WIDENED IN PHASE 7, AND THIS IS THE ONLY PLACE
// THAT CONTRACT IS WRITTEN DOWN. Before this phase every entry meant exactly one
// thing: "Drift never registered this CLI at all". It now ALSO reaches
// `getProviderStatuses` and renders on the Settings → CLI Providers card, where
// an entry may equally mean "registered, but a capability is missing". The map
// carries NO kind discriminator for the difference and deliberately gains none:
// a separate per-provider capability notice was considered and rejected as new
// frontend surface. Therefore every sentence written into this map MUST
// disambiguate on its own — it has to tell a user which of those two states
// they are in without any other field's help.
const skippedMcpCliReasons = new Map<"gemini" | "codex", string>();

// Every scope whose LAST removal attempt did not complete, per CLI, with the
// exit code it failed with. Populated by the three removal sites below and
// surfaced as a diagnostics field, so a support bundle carries the count and
// the scope of a removal that did not finish — the machine-readable companion
// to the security line the user reads on the provider card.
//
// Keyed by scope rather than appended to, so a later successful removal of the
// SAME scope clears its own entry and nothing else. A CLI with no entries here
// has nothing outstanding; that is the condition `registerMcpWithCli` consults
// before it clears a skip reason, so a successful `mcp add` cannot erase a
// security line about a stale entry it did not remove.
const mcpCliRemovalFailures = new Map<
  "gemini" | "codex",
  Map<McpCliRemovalScope, number>
>();

// WR-04. Which blocked-sweep residual notices this PROCESS has already emitted,
// keyed by CLI and the command value that could not be used. Process-lifetime by
// design: the notice is worth saying once per Drift run and per change to the
// field, and worth saying again after a restart, but not on every MCP start —
// a line that repeats forever is the one a user stops reading, which is the
// failure `sweepStaleMcpCliRegistrations` and `classifyMcpRemoveExit` both
// already argue against for their own messages.
//
// Holds a provider command string, so like every other value on this path it is
// a KEY only and is never rendered: `formatMcpSweepBlockedResidual` takes no
// parameter through which it could arrive.
const mcpCliBlockedSweepNotices = new Set<string>();

function recordMcpCliRemovalOutcome(input: {
  cli: "gemini" | "codex";
  scope: McpCliRemovalScope;
  exitCode: number;
  failed: boolean;
}): void {
  const existing = mcpCliRemovalFailures.get(input.cli);
  if (!input.failed) {
    if (existing === undefined) return;
    existing.delete(input.scope);
    if (existing.size === 0) mcpCliRemovalFailures.delete(input.cli);
    return;
  }
  const bucket = existing ?? new Map<McpCliRemovalScope, number>();
  bucket.set(input.scope, input.exitCode);
  mcpCliRemovalFailures.set(input.cli, bucket);
}

type McpCliProviderId = "gemini-cli" | "codex-cli";
const MCP_CLI_TO_PROVIDER: Record<"gemini" | "codex", McpCliProviderId> = {
  gemini: "gemini-cli",
  codex: "codex-cli",
};

function mcpCliForProviderId(providerId: string): "gemini" | "codex" | undefined {
  // Read THROUGH the existing map rather than writing a second, inverted one:
  // two tables would be two things to keep in step.
  for (const cli of ["gemini", "codex"] as const) {
    if (MCP_CLI_TO_PROVIDER[cli] === providerId) return cli;
  }
  return undefined;
}

// D-08's wiring, and the ONE place the two limitation sources meet. Called only
// on the resolved arm of `checkProvider` — a provider that never resolved is
// `unavailable` with a precise error, and a capability sentence on top of that
// would just be noise.
//
// A limitation NEVER rides the `error` field: `error` paints the status dot red,
// and a registered-but-limited provider is genuinely working (PD-01).
function applyProviderLimitation(status: ProviderStatus): ProviderStatus {
  let next = status;

  // Source 1 — the static per-CLI approval-channel table.
  const channel = providerMcpApprovalChannel(status.id);
  if (channel.kind === "None") {
    next = { ...next, capability: "limited", limitation: channel.limitation };
  }

  // Source 2 — the live skip-reason map, for the two externally registered CLIs.
  // A skip reason means Drift is not attached AT ALL, so the dot drops to amber
  // rather than staying green: a provider that resolved but was not registered
  // is genuinely between states, and the sentence is what tells the two apart.
  const cli = mcpCliForProviderId(status.id);
  if (cli !== undefined) {
    const reason = skippedMcpCliReasons.get(cli);
    if (reason !== undefined) {
      // The skip reason WINS when both sources speak: "Drift could not register
      // this CLI at all" is a stronger fact than what it would have been able to
      // do had it registered.
      next = { ...next, capability: "limited", limitation: reason };
    }
  }

  return next;
}

// Runs the CLI's own `mcp remove` then `mcp add`, with the ARGV already decided
// by the pure planner. This function assembles no command line of its own.
//
// EVERY spawn goes through buildSpawnPlan, not just the add. The pre-clean is a
// separate spawn on the same binary, so routing only the add would leave a
// `.cmd`-resolved Gemini or Codex failing the removal with EINVAL on Windows —
// and that removal is load-bearing rather than best-effort: a failure means a
// stale entry holding a live Caido session token stayed where it was.
//
// windowsVerbatimArguments is passed as a LITERAL key at each call, with its
// value taken from the plan. Taking the plan's file and args while dropping its
// flag is not a partial success: the runtime then applies its own per-element
// MSVC quoting on top of a command line buildSpawnPlan already escaped, cmd
// re-parses the result under different rules, and the argv arrives corrupted
// while carrying a live credential. Nothing in this file is test-reachable, so
// the phase's source criteria assert the flag's DELIVERY here.
async function registerMcpWithCli(
  cli: "gemini" | "codex",
  cliBinary: string,
  argv: string[],
  sdk: BackendSDK,
): Promise<boolean> {
  // Pre-clean, across EVERY scope the policy covers — and no longer
  // best-effort. The scope list is `planMcpCliRemoval`'s, the same one the
  // startup sweep and the session cleanup iterate, so the three removal sites
  // cannot cover different ground.
  //
  // A failure here is a SECURITY event on the same terms as everywhere else: a
  // stale entry that survives a removal keeps holding a Caido session token,
  // and for Gemini's working-directory scope it also SHADOWS the fresh
  // user-scope entry the `mcp add` below is about to write.
  for (const removal of planMcpCliRemoval({ cli, platform: host?.platform })) {
    const removePlan = buildSpawnPlan({
      command: cliBinary,
      args: removal.argv,
      platform: host?.platform,
      comspec: getComspec(),
    });
    const removeResult = await spawnAndWait(removePlan.file, removePlan.args, {
      windowsVerbatimArguments: removePlan.windowsVerbatimArguments,
    });
    // WR-05. `unusable` is the spawn that never started - an EINVAL, an ENOENT,
    // a binary deleted between resolve and spawn - and spawnAndWait reports it
    // with the same synthetic `code: 1` a genuine failure carries. It is logged
    // and then DROPPED: nothing is recorded, because a removal that did not run
    // is not evidence either way, and nothing is claimed, because the security
    // line asserts a credential may remain and no process ever looked.
    const outcome = classifyMcpRemoveExit({
      cli,
      exitCode: removeResult.code,
      spawnFailed: !removeResult.spawned,
    });
    if (outcome === "unusable") {
      sdk.console.log(formatMcpRemoveUnusable({ cli, scope: removal.scope }));
      continue;
    }
    const failed = outcome === "failed";
    recordMcpCliRemovalOutcome({
      cli,
      scope: removal.scope,
      exitCode: removeResult.code,
      failed,
    });
    if (failed) {
      sdk.console.error(
        formatMcpRemoveFailure({
          cli,
          scope: removal.scope,
          exitCode: removeResult.code,
        }),
      );
    }
  }

  const addPlan = buildSpawnPlan({
    command: cliBinary,
    args: argv,
    platform: host?.platform,
    comspec: getComspec(),
  });
  // GUARDED (CR-01). `argv` comes from `buildMcpCliRegistrationArgv`, which ends
  // `…, nodeExecutable, mcpScriptPath` for gemini and `…, --, nodeExecutable,
  // mcpScriptPath` for codex — so THIS process's own command line carries
  // `<mcpTempDir>/mcp-server.mjs` and the reaper's pattern matches it. A reaped
  // registration leaves the provider unattached with a spurious non-zero exit,
  // the same class as the AR-06 removal failures. The pre-clean spawns above are
  // deliberately NOT wrapped: their argv is `mcp remove drift --scope …` and
  // carries no script path.
  const result = await withDirectMcpCall(() =>
    spawnAndWait(addPlan.file, addPlan.args, {
      windowsVerbatimArguments: addPlan.windowsVerbatimArguments,
    }),
  );
  // THREE SCALARS, and no stderr — the CLI name, the resolved binary and the
  // exit code. This log line used to interpolate `result.stderr`, and the
  // skip-reason below used to as well; 07-02 wired `skippedMcpCliReasons` to the
  // provider card, and that map already reaches the diagnostics bundle. A CLI
  // that echoes its own configuration back on an error would therefore have put
  // a live Caido token onto a user-visible surface and into an exportable
  // support file. This is 05-D-11's standing key-names-never-values rule applied
  // to a VALUE channel nobody had inventoried (T-07-05).
  sdk.console.log(
    `[drift] ${cli} mcp add via ${cliBinary}: code=${String(result.code)}`,
  );
  if (result.code === 0) {
    registeredMcpCliPaths.set(cli, cliBinary);
    // Cleared ONLY when nothing is outstanding. A successful `mcp add` says
    // Drift is attached; it says nothing about the stale entry a failed
    // pre-clean left in another scope, and that entry still holds a credential.
    // Deleting the reason unconditionally here would erase the security line
    // written moments earlier in this same function — a silent wipe of the one
    // message SC-3 exists to deliver.
    const outstanding = formatMcpRemoveFailures({
      cli,
      outstanding: mcpCliRemovalFailures.get(cli) ?? new Map(),
    });
    if (outstanding !== undefined) {
      skippedMcpCliReasons.set(cli, outstanding);
    } else {
      skippedMcpCliReasons.delete(cli);
    }
    return true;
  }
  // D-08: this sentence renders on the provider card and must disambiguate
  // "never registered" from "registered, but limited" on its own.
  //
  // T-07-08. COMPOSED, never overwritten. The success branch above goes to
  // deliberate length to preserve a removal-failure line, and this branch used
  // to perform exactly the wipe that comment warns against — an unconditional
  // `set` three lines later, on the ONE path where both halves went wrong.
  //
  // The compound case is the reason: the pre-clean removal failed AND the `mcp
  // add` failed, so a stale entry holding a live Caido session token is still on
  // disk and Drift is not attached to overwrite it on the next turn. Reporting
  // only "could not register" there tells the user the least useful of the two
  // facts and silently drops the one SC-3 exists to deliver.
  //
  // Security line FIRST: on a card that truncates, the credential outranks the
  // registration status.
  const outstanding = formatMcpRemoveFailures({
    cli,
    outstanding: mcpCliRemovalFailures.get(cli) ?? new Map(),
  });
  const registrationFailure = `Drift could not register with this CLI: "mcp add" exited with code ${String(result.code)}.`;
  skippedMcpCliReasons.set(
    cli,
    outstanding === undefined
      ? registrationFailure
      : // Newline, not a space: `outstanding` ends with a paste-able
        // remediation command, and butting the next sentence against it leaves
        // the user working out by eye where the command stops.
        `${outstanding}\n${registrationFailure}`,
  );
  return false;
}

// D-03 / PRV-03. The ONE place Gemini and Codex are registered, and it now runs
// on EVERY platform — the Phase 5 wrapper write and the `platform !== "win32"`
// condition that guarded it are both gone, because there is no longer a shell
// script to write and no platform on which registration is skipped for being
// Windows. Both callers (MCP start, and the settings-save / token-sync refresh)
// reach this one loop, so neither can drift from the other.
//
// What replaces the wrapper: the CLIs' own `-e`/`--env` surface. The payload and
// the argv are built by pure functions in mcp-server-spec.ts, precisely because
// an `if (platform === …)` inside THIS file is unassertable — index.ts cannot be
// imported under vitest, so anything decided here is unverifiable by
// construction.
//
// The four per-CLI guards below keep their sentences byte-for-byte: 07-02 wired
// this map to the Settings → CLI Providers card, so rewording one would silently
// change what a user reads.
async function tryRegisterMcpForProviders(spec: McpServerSpec, sdk: BackendSDK): Promise<void> {
  // Structurally always present — buildMcpServerSpec sets `args` to exactly
  // `[mcpScriptPath]` — but `noUncheckedIndexedAccess` makes the read optional,
  // and registering a server with an empty script path would be worse than not
  // registering at all.
  const mcpScriptPath = spec.args[0];
  if (mcpScriptPath === undefined) return;
  // The literal token, from the same source the spec itself uses. Only Codex's
  // payload embeds it; Gemini's carries a reference (see the payload builder).
  const caidoToken = getEffectiveCaidoToken();

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
    // The capability table (07-02) decides the tool policy, not a second
    // hand-written list here: an absent approval channel is what turns Codex's
    // allowlist into its sensitive-filtered form inside the builder (D-06).
    const registrationEnv = buildMcpCliRegistrationEnv({
      cli,
      driftVars: spec.driftVars,
      approvalChannel: providerMcpApprovalChannel(providerId),
      caidoToken,
    });
    const registration = planMcpCliRegistration({
      platform: host?.platform,
      cli,
      registrationEnv,
      argv: buildMcpCliRegistrationArgv({
        cli,
        registrationEnv,
        nodeExecutable: spec.command,
        mcpScriptPath,
      }),
      // The loud check's input, and the environment it names matters more than
      // the value does.
      //
      // This used to pass `spec.env`, described as "the parent-merged block
      // Drift hands the CLI child". It is not. `spec.env` is built by
      // buildMcpServerSpec and is the block handed to the MCP SERVER's own node
      // process (callMcpMethod spawns with it). The CLI child's block is
      // assembled independently in sendCliMessage, from
      // `buildSpawnEnv({ parentEnv: readParentEnv(), driftVars:
      // injectedDriftVars })` - a different object, built at a different time,
      // and the one gemini's `${CAIDO_TOKEN}` reference actually expands from.
      // Two environments cannot both be the thing a comment names, and the
      // comment named the wrong one (WR-02).
      //
      // So the value is rebuilt HERE with the same production builder
      // sendCliMessage uses, over the same parent environment, rather than
      // borrowed from a block that only looked interchangeable. `spec.driftVars`
      // is what `runtimeEnv` is derived from, so this is that composition minus
      // the per-session file keys - which is the correct shape for a
      // registration that happens once, before any session exists (D-03).
      //
      // Stated plainly rather than implied, because the reviewer was right that
      // a guard which cannot fire is worse than no guard: with a `spec` in hand
      // this value CANNOT be empty. requireMcpServerSpec returns
      // NO_CAIDO_TOKEN_MESSAGE before a spec is ever constructed, and
      // buildSpawnEnv overlays driftVars last. The check is therefore a
      // STRUCTURAL BACKSTOP against a future caller that builds a spec another
      // way - the same role classifyMcpRemoveExit's docblock claims for itself -
      // and NOT a live gate. The reachable fail-closed guard for an absent token
      // is the one in planMcpCliRegistration that inspects `registrationEnv`,
      // which is the dict actually written into the CLI's config file (WR-06).
      spawnEnvToken: buildSpawnEnv({
        parentEnv: readParentEnv(),
        driftVars: spec.driftVars,
      }).CAIDO_TOKEN,
    });
    if (registration.kind === "Skip") {
      skippedMcpCliReasons.set(cli, registration.reason);
      sdk.console.log(`[drift] ${cli} mcp register skipped: ${registration.reason}`);
      continue;
    }
    await registerMcpWithCli(cli, resolved, registration.argv, sdk);
  }
}

// The session-cleanup removal: what THIS run registered, taken back out.
//
// NOT gated on the current `enabled` flag — if we previously registered, we
// clean up, even if the user disabled the provider afterwards. Otherwise we'd
// leak dangling `drift` entries in external CLI config files.
//
// The early return on a path this process recorded STAYS, and the relationship
// to `sweepStaleMcpCliRegistrations` is ADDITIVE rather than overlapping: this
// is the cleanup path for what this run registered, and the sweep is the cover
// for everything else — a previous run's entry, a crashed run's entry, an entry
// from a release before this phase. Do not later "unify" the two into one
// function: collapsing them would either make cleanup unconditional (removing
// entries mid-session that a concurrent Drift may have just written) or make
// the sweep conditional on a map a crash has already destroyed, which is the
// exact gap the sweep exists to close.
//
// EVERY scope, from the same policy the sweep and the pre-clean iterate, and a
// failure is the same security event on all three paths.
async function unregisterMcpFromCli(cli: "gemini" | "codex", sdk: BackendSDK): Promise<void> {
  const storedPath = registeredMcpCliPaths.get(cli);
  if (storedPath === undefined) {
    // We never registered this CLI in this session — nothing to do.
    return;
  }
  for (const removal of planMcpCliRemoval({ cli, platform: host?.platform })) {
    const removePlan = buildSpawnPlan({
      command: storedPath,
      args: removal.argv,
      platform: host?.platform,
      comspec: getComspec(),
    });
    // windowsVerbatimArguments is a LITERAL key here, with its value taken from
    // the plan. These spawns pass no environment, so they take spawnAndWait's
    // NO-ENV branch, whose options object was hardcoded before 07-01 widened
    // it. A removal that arrives with a re-quoted argv removes NOTHING and
    // leaves the credential in place, which is the precise failure this whole
    // plan exists to prevent — so the phase's source criteria assert the flag's
    // DELIVERY at each removal site, not merely that the builder was called.
    const result = await spawnAndWait(removePlan.file, removePlan.args, {
      windowsVerbatimArguments: removePlan.windowsVerbatimArguments,
    });
    // The same three-way read as the pre-clean, for the same reason (WR-05).
    const outcome = classifyMcpRemoveExit({
      cli,
      exitCode: result.code,
      spawnFailed: !result.spawned,
    });
    if (outcome === "unusable") {
      sdk.console.log(formatMcpRemoveUnusable({ cli, scope: removal.scope }));
      continue;
    }
    const failed = outcome === "failed";
    recordMcpCliRemovalOutcome({
      cli,
      scope: removal.scope,
      exitCode: result.code,
      failed,
    });
    if (!failed) continue;
    const line = formatMcpRemoveFailure({
      cli,
      scope: removal.scope,
      exitCode: result.code,
    });
    // BOTH channels. The console alone is diagnostics; the reason map is what
    // 07-02 wired to the Settings -> CLI Providers card, and a security event
    // that reaches only a support bundle is the surface 05-D-03 rejected.
    sdk.console.error(line);
    skippedMcpCliReasons.set(cli, line);
  }
  registeredMcpCliPaths.delete(cli);
}

// Remove stale `drift` entries left in the external CLIs' own configuration by
// a previous run that did not stop cleanly — a crash, a hard kill, a Caido
// restart — or by a release from before this phase. Those entries hold a live
// Caido session token in a home-directory file that sits OUTSIDE the temp root
// `sweepOrphanedMcpTempDirs` walks, so they survive every sweep Drift had until
// now. Safe to run here for the same reason the orphan sweep is: startMcpServer
// is only entered when MCP is not already running, and both CLIs' removal
// implementations exit zero whether or not an entry existed, so the removal is
// idempotent and needs to know nothing about what is currently registered.
//
// Four gates it deliberately does NOT carry, and they are the whole point:
//
//   1. the provider's `enabled` flag — a user who disabled the CLI after a
//      crash is exactly the case that never gets cleaned otherwise;
//   2. `registeredMcpCliPaths` — that map is process-lifetime only, so the run
//      that crashed took its record with it;
//   3. any platform condition — refusing to remove leaves a credential behind,
//      which inverts the fail-closed instinct every other predicate here obeys;
//   4. a prior registration attempt succeeding.
//
// Those four are precisely why the pre-clean inside `registerMcpWithCli` does
// not run on the paths that matter (07-RESEARCH.md § Q4 DEFECT 2): it sits
// behind all of them. The reasoning is `unregisterMcpFromCli`'s own existing
// argument — if we may have registered, we clean up even if the user has since
// disabled the provider — extended across PROCESS LIFETIMES rather than
// sessions.
//
// TWO GATES IT DOES CARRY, and this paragraph exists because they were left out
// of the list above while the word UNCONDITIONAL was left in (WR-04). Both are
// forced rather than chosen: this function removes an entry by SHELLING THE
// CLI'S OWN `mcp remove`, so with no command field and no resolvable binary
// there is no removal to run.
//
//   5. an empty `providers[*].command` — a deliberate user edit; the shipped
//      defaults are non-empty;
//   6. `resolveCommand` returning undefined — the CLI is not installed, or was
//      renamed, moved or uninstalled since Drift last registered with it.
//
// Gate 6 is the highest-value case the sweep exists for, inverted: hard-kill
// while Codex is registered, then the binary goes away, and `~/.codex/config.toml`
// keeps a literal Caido session token indefinitely. Neither gate can be removed,
// so the residual is REPORTED instead — see the blocked-sweep branch below. The
// README's promise was rewritten in the same commit to state the same thing;
// they are one claim written in two places and must not drift apart again.
//
// Per-iteration try/catch isolation, copied from the orphan sweep: one CLI that
// hangs, throws or cannot be read must not abort the other's sweep or MCP start.
async function sweepStaleMcpCliRegistrations(sdk: BackendSDK): Promise<void> {
  for (const cli of ["gemini", "codex"] as const) {
    try {
      const providerConfig = currentSettings.providers[MCP_CLI_TO_PROVIDER[cli]];
      const command = providerConfig?.command;
      // Gate 5 and gate 6 (WR-04), taken together because they have one
      // consequence: the sweep cannot run, so whatever this CLI's configuration
      // holds stays there. The old code treated the second as "not a security
      // event: nothing here says a Drift entry may remain", which was true of
      // the SENTENCE and false of the situation.
      const resolved =
        command === undefined || command === ""
          ? undefined
          : await resolveCommand(command);
      if (resolved === undefined) {
        // The card sentence keeps its existing wording and its existing
        // channel. It is deliberately NOT the residual notice: an unresolvable
        // command short-circuits `checkProvider` to `capability: "unavailable"`
        // before `applyProviderLimitation` runs, so this string does not render
        // on the provider card in exactly this case. Writing the security
        // sentence into a map nothing reads is how the residual stayed silent.
        if (command !== undefined && command !== "") {
          skippedMcpCliReasons.set(
            cli,
            `command "${command}" did not resolve to an executable path`,
          );
        }
        // The channel that DOES reach the user. Once per process per command
        // value, not once per MCP start: a user who has one of these two CLIs
        // installed and not the other would otherwise collect the same line
        // every time they press Start, and a message that repeats forever is the
        // one nobody reads — the same argument the removal classifier makes for
        // its own banner.
        const noticeKey = `${cli}:${command ?? ""}`;
        if (!mcpCliBlockedSweepNotices.has(noticeKey)) {
          mcpCliBlockedSweepNotices.add(noticeKey);
          sdk.console.error(formatMcpSweepBlockedResidual({ cli }));
        }
        continue;
      }
      for (const removal of planMcpCliRemoval({
        cli,
        platform: host?.platform,
      })) {
        const removePlan = buildSpawnPlan({
          command: resolved,
          args: removal.argv,
          platform: host?.platform,
          comspec: getComspec(),
        });
        // The literal key again, value from the plan — see the identical note
        // at unregisterMcpFromCli. This is the removal that runs on the machine
        // where the credential exposure is greatest, so a dropped flag here is
        // the worst of the three.
        const result = await spawnAndWait(removePlan.file, removePlan.args, {
          windowsVerbatimArguments: removePlan.windowsVerbatimArguments,
        });
        // WR-05, and this is the site where it mattered most: the sweep runs
        // UNCONDITIONALLY at every MCP start, so a spawn that cannot start -
        // rather than a removal that failed - used to paint the SECURITY line
        // on the provider card on every single start. A banner that fires every
        // time teaches the user to ignore the one that matters, which is the
        // outcome classifyMcpRemoveExit's own docblock exists to prevent.
        const outcome = classifyMcpRemoveExit({
          cli,
          exitCode: result.code,
          spawnFailed: !result.spawned,
        });
        if (outcome === "unusable") {
          sdk.console.log(formatMcpRemoveUnusable({ cli, scope: removal.scope }));
          continue;
        }
        const failed = outcome === "failed";
        recordMcpCliRemovalOutcome({
          cli,
          scope: removal.scope,
          exitCode: result.code,
          failed,
        });
        // A clean start writes NOTHING: no reason-map entry, no console line.
        // A banner that appears on every start teaches the user to ignore the
        // one message that matters, which would defeat SC-3 entirely.
        if (!failed) continue;
        const line = formatMcpRemoveFailure({
          cli,
          scope: removal.scope,
          exitCode: result.code,
        });
        sdk.console.error(line);
        skippedMcpCliReasons.set(cli, line);
      }
    } catch (error) {
      sdk.console.error(
        `[drift] Failed to sweep stale ${cli} MCP registrations: ${String(error)}`,
      );
    }
  }
}

// The staged session's temp-directory NAME — the marker the orphan reaper
// identifies Drift's own MCP children by. `undefined` when no runtime is staged,
// which `buildSessionOrphanScanPlan` refuses with `bad-marker` rather than
// composing a pattern from nothing.
//
// `path.basename` rather than a hand-rolled split: this value is only ever read
// on the POSIX arm (the win32 scan refuses before the marker is looked at), so
// the Linux-flavoured resolution `kill-plan.ts` avoids `path` for is not a
// hazard here.
function getMcpSessionDirName(): string | undefined {
  if (mcpTempDir === undefined) return undefined;
  return path.basename(mcpTempDir);
}

// THE ORPHAN REAP — the I/O boundary, and nothing else.
//
// It takes an ALREADY-BUILT scan plan so that every decision this mechanism
// makes lives in `kill-plan.ts`, where a test can reach it, and this function
// keeps only the spawning. That split is the same one `killTree` and
// `buildKillTreePlan` already have, and for the same reason: `index.ts` declares
// no `caido:plugin` alias and cannot be imported by any test this project can
// run (Pitfall 3).
//
// WHY IT EXISTS AT ALL. `killTree` walks `activeProcesses`, so it can only reach
// a process Drift SPAWNED. UAT gap 4 measured a `node <temp>/drift-mcp-<token>/
// mcp-server.mjs` alive on 2026-08-27 holding a live CAIDO_TOKEN with
// `activeSessions: 0`, parented by a Codex binary Drift never spawned and absent
// from `activeProcesses`. No termination path in this file could reach it. This
// one can, because it identifies its target by the TARGET'S OWN ARGV rather than
// by a handle Drift holds or by a process group the CLI chose (A6, falsified).
//
// FIRE-AND-FORGET, returning `void` and awaiting nothing — the same contract
// `killTree` carries and for the same recorded reason (OQ-4). Awaiting here
// would suspend an RPC handler on a child-process callback and a timer that
// Caido's runtime does not reliably deliver during an await, which is the
// event-loop starvation anti-pattern CLAUDE.md names.
function reapMcpOrphans(
  sdk: BackendSDK,
  plan: KillTreePlan,
  excludePids: number[],
): void {
  if (plan.kind === "none") {
    sdk.console.log(`[drift lifecycle] no orphan reap: ${plan.reason}`);
    return;
  }

  // EVERY outcome routes through here, including the ordinary one, so
  // `classifyOrphanScanOutcome` is consulted exactly once per scan and this
  // function contains no second copy of its four-arm ladder — a duplicated
  // ladder is one the unit test does not cover.
  const settleScan = (result: {
    spawnThrew: boolean;
    exitCode: number | null | undefined;
    timedOut: boolean;
    stdout: string;
  }): void => {
    const outcome = classifyOrphanScanOutcome({
      spawnThrew: result.spawnThrew,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      pids: parseOrphanScanPids({ stdout: result.stdout, excludePids }),
    });

    // ONE line, SCALARS ONLY: the outcome kind, its reason, the exit code and
    // the COUNT of pids signalled. No path, no argv, no environment value and no
    // pid — the T-04-04 rendering rule `killTree`'s header states, and a pid
    // here would be the one value that could correlate this line with a user's
    // process table.
    if (outcome.kind === "noop") {
      sdk.console.log(
        `[drift lifecycle] orphan reap: kind=noop reason=${outcome.reason} exit=${String(result.exitCode)} killed=0`,
      );
      return;
    }

    let signalled = 0;
    for (const pid of outcome.pids) {
      const killPlan = buildOrphanKillPlan({ pid, platform: host?.platform });
      if (killPlan.kind === "none") continue;
      try {
        const killer: ChildProcessWithoutNullStreams = spawn(
          killPlan.file,
          killPlan.args,
          {
            stdio: ["pipe", "pipe", "pipe"],
            windowsVerbatimArguments: killPlan.windowsVerbatimArguments,
          },
        );
        // Drained and discarded so neither pipe can fill and stall the killer —
        // the same treatment `killTree` gives its own.
        killer.stdout?.on("data", () => undefined);
        killer.stderr?.on("data", () => undefined);
        killer.on("error", () => undefined);
        signalled += 1;
      } catch {
        /* unspawnable killer; counted as not signalled */
      }
    }

    sdk.console.log(
      `[drift lifecycle] orphan reap: kind=reap exit=${String(result.exitCode)} killed=${String(signalled)}`,
    );
  };

  let settled = false;
  let out = createBoundedBuffer({
    maxChars: SPAWN_STDOUT_MAX_CHARS,
    retention: "head",
  });

  // C-8 / § Pitfall 9: `spawn()` throws SYNCHRONOUSLY for an unspawnable file,
  // and a host with no `pgrep` is exactly that. An escaping throw would surface
  // as a failed RPC on a teardown path, so the throw is caught and classified as
  // `enumerator-unavailable` — such a host is left precisely as well served as
  // it is at HEAD, because this reaper removes no pre-existing termination path.
  let scanner: ChildProcessWithoutNullStreams;
  try {
    scanner = spawn(plan.file, plan.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsVerbatimArguments: plan.windowsVerbatimArguments,
    });
  } catch {
    settleScan({
      spawnThrew: true,
      exitCode: undefined,
      timedOut: false,
      stdout: "",
    });
    return;
  }

  // The settled-flag + setTimeout + child.kill shape copied from
  // `resolveCommand`, not reinvented: the timer is cleared on close and on
  // error, and the flag makes whichever fires first the only one that settles.
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    try {
      scanner.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    settleScan({
      spawnThrew: false,
      exitCode: undefined,
      timedOut: true,
      stdout: "",
    });
  }, ORPHAN_SCAN_TIMEOUT_MS);

  scanner.stdout?.on("data", (d: Buffer) => {
    out = appendBounded(out, d.toString());
  });
  scanner.stderr?.on("data", () => undefined);
  scanner.on("error", () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    settleScan({
      spawnThrew: true,
      exitCode: undefined,
      timedOut: false,
      stdout: "",
    });
  });
  scanner.on("close", (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    // The retained HEAD, never renderBoundedBuffer: above the cap the rendered
    // value splices a truncation marker between head and tail, and this value is
    // about to be parsed into numbers. Same rule as `resolveCommand`'s path read.
    settleScan({
      spawnThrew: false,
      exitCode: code,
      timedOut: false,
      stdout: out.head,
    });
  });
}

// THE IDLE-GATED SESSION REAP — LIF-02 at the moment the requirement names it,
// and without any dependence on process groups.
//
// A6 was measured FALSE, so the group signal a cancel issues does not reliably
// reach the provider CLI's `mcp-server.mjs` child: the reported bug is one turn,
// click Stop, and a token-bearing MCP server still running. `killTree` cannot
// close that — it walks `activeProcesses`, and the child is not in it. The reaper
// can, because it identifies its target by the target's own argv.
//
// WHY IT IS GATED. The marker is the shared `mcpTempDir` name, which EVERY
// concurrent session's MCP child carries, so an ungated reap here would kill the
// MCP server of a turn the user is watching (T-08-27). `shouldReapSessionOrphans`
// (kill-plan.ts, unit-asserted from literal scalars) opens the gate only when
// `activeProcesses` is empty AND Drift has no direct MCP call of its own in
// flight. That covers the reported bug exactly; what it does NOT cover — a cancel
// while a SECOND session is live — is residual AR-07 and threat T-08-50, named
// at the predicate itself so a reader sees the gap rather than inferring
// completeness.
//
// RETURNS `void` AND AWAITS NOTHING, and that is a requirement rather than a
// style: it is called from `cancelCliMessage` and `closeCliSession`, which are
// SYNCHRONOUS `Result<void>` handlers. Making this async would force them async
// and change their signatures, which recorded decision OQ-4 forbids. It also
// keeps the RPC handler off the event-loop starvation path CLAUDE.md names.
function reapSessionOrphansIfIdle(sdk: BackendSDK): void {
  if (
    !shouldReapSessionOrphans({
      activeSessionCount: activeProcesses.size,
      directMcpCallDepth: mcpDirectCallDepth,
    })
  ) {
    return;
  }

  reapMcpOrphans(
    sdk,
    buildSessionOrphanScanPlan({
      platform: host?.platform,
      sessionDirName: getMcpSessionDirName(),
    }),
    [],
  );
}

async function cleanupMcpRuntime(
  sdk: BackendSDK,
  authState: McpAuthState = "unknown",
  authMessage = "",
): Promise<void> {
  await unregisterMcpFromCli("gemini", sdk);
  await unregisterMcpFromCli("codex", sdk);

  // SC-4 / LIF-01 / LIF-02 — THE SEAM PHASE 7 MARKED HERE, NOW ACTED ON. Phase 7
  // left a marker at this exact spot recording that the provider process tree
  // must be terminated BEFORE the temp-directory removal below, and that the
  // statement order was being left alone until this phase. The loop below is
  // that termination; `grep LIF-01` still lands here, and the requirement now
  // lands here as code rather than as a promise.
  //
  // WHY THE ORDER IS THE CONTROL AND NOT THE CALL. The directory removed below
  // holds the env-source documents — the MCP config, the context file, the
  // per-session approvals and activity files — that carried the Caido token into
  // every tracked child's environment. Removing them while such a child is still
  // running destroys the forensic trail (which pid, which session, which policy)
  // while leaving the capability completely intact, because the token is in the
  // process's MEMORY and not in the file it arrived through. Deleting a
  // token-bearing file is not revocation; killing the process that read it is.
  // The removal below must NOT be moved above this loop.
  //
  // WHO ACTUALLY REACHES THIS LOOP — the full list, because the comment that
  // stood here named two callers and there are TWELVE (review WR-01, and
  // T-08-12's enumeration is corrected to match). `startMcpServer`'s own failure
  // path is the one T-08-12 was written for and it is still covered. But so are
  // these, and two of them fire during NORMAL OPERATION rather than teardown:
  //
  //   * `updateSettings:1847` — any settings save carrying `caidoApi` while MCP
  //     is up, if `refreshActiveMcpRuntime` throws.
  //   * `refreshActiveMcpRuntime:1873/1888/1894/1900` — four error branches
  //     (empty token, spec failure, context-file write failure, auth validation
  //     failure), reached from `syncCaidoSessionToken`, which the FRONTEND
  //     KEEP-ALIVE drives whenever the effective Caido token changes. A token
  //     rotation mid-turn, or one momentarily-empty `CAIDO_AUTHENTICATION` read,
  //     lands here.
  //   * `startMcpServer:3545/3639/3658/3671/3682/3688` and `stopMcpServer:3715`
  //     — the teardown and start-failure paths.
  //
  // THE LOOP IS NOT NARROWED TO THE TEARDOWN CALLERS, and the reason is SC-4
  // rather than convenience: every one of these paths continues into the
  // temp-directory removal below. Killing on some of them and not others would
  // mean removing the env-source documents that carried CAIDO_TOKEN while a
  // child that read them is still running — the precise thing SC-4 forbids, and
  // deleting a token-bearing file is not revocation. So the loop stays wide and
  // is made HONEST instead: a session force-stopped here gets the same
  // `stopped` event and watchdog cleanup a Stop button would have given it.
  //
  // Without that, the collateral was silent: `activeProcesses.delete` had
  // already run, so a later `cancelCliMessage` for the session found
  // `proc === undefined` and returned `ok` WITHOUT publishing any state — the
  // user's Stop button becoming a no-op for a session still on their screen.
  //
  // The FORCEFUL rung, deliberately: MCP is being torn down, so there is no turn
  // left for anyone to read partial output from, and on the failure path nothing
  // is in flight at all. Nothing here is awaited — spawnAndWait carries no
  // timeout, so an awaited kill could hold cleanup open indefinitely (Pitfall 8),
  // and `publishSessionState` is synchronous.
  for (const [sessionId, proc] of activeProcesses.entries()) {
    killTree(sdk, proc, "kill");
    activeProcesses.delete(sessionId);
    // Dropped with the process it pumps. A watchdog left behind is polled by the
    // frontend keep-alive against a session whose child is gone.
    sessionWatchdogs.delete(sessionId);
    const snapshot = getSessionSnapshot(sessionId);
    if (snapshot !== undefined) {
      publishSessionState(sdk, {
        sessionId,
        chatId: snapshot.chatId,
        providerId: snapshot.providerId,
        state: "stopped",
        reason:
          "The MCP runtime was torn down, so this provider turn was stopped.",
        reasonCode: "closed",
        // FALSE, and it is a statement: the temp directory holding every MCP
        // runtime file is removed immediately below.
        mcpAttached: false,
      });
    }
  }

  // THE FAIL-SAFE RESET (review WR-01). The depth counter belongs to the MCP
  // RUNTIME, and this function is where that runtime ends: every direct MCP
  // child was staged from the temp directory removed below, and the loop above
  // has just killed everything Drift holds a handle on. A depth still standing
  // at this point is a release that never arrived, not a call still in flight.
  //
  // Without this the leak is PERMANENT rather than per-operation — the counter
  // is module-level and nothing else ever writes zero to it — so one undelivered
  // `close` disabled the idle reap for the rest of the plugin load. Bounding it
  // to the runtime's own lifetime is what makes the failure recoverable: the
  // next `startMcpServer` begins from a counter that means what it says.
  //
  // Safe in the other direction too, and that is the half worth checking rather
  // than assuming: this is a TEARDOWN, so a reap that fires afterwards has
  // nothing of Drift's left to protect, and `getMcpSessionDirName()` returns
  // `undefined` once `mcpTempDir` is cleared below — which makes the scan
  // builder refuse with `bad-marker` in any case. A release arriving after this
  // line cannot drive the counter negative because `releaseDirectMcpCall`
  // clamps.
  mcpDirectCallDepth = 0;

  // THE ORPHAN REAP, ABOVE THE REMOVAL — SC-4's statement order, extended to the
  // mechanism that does not depend on `activeProcesses`. The loop above reaches
  // every child Drift SPAWNED; this reaches every `mcp-server.mjs` staged from
  // THIS session's temp directory whatever spawned it, which is the class UAT
  // gap 4 measured alive with a live token and no turn behind it.
  //
  // WHY IT SITS ABOVE THE REMOVAL. Same reason the kill loop does: the directory
  // removed below holds the env-source documents that carried the Caido token,
  // and deleting a token-bearing file is not revocation — the token is in the
  // surviving process's MEMORY. Killing the process that read it is.
  //
  // WHY THE COMPLETION ORDER IS NOT ENFORCED. Nothing here is awaited, so the
  // scan may still be running when `rm` below returns. Awaiting it would suspend
  // an RPC handler on a child-process callback and a timer Caido's runtime does
  // not reliably deliver during an await — the starvation anti-pattern CLAUDE.md
  // names, and the reason `killTree` is fire-and-forget in the first place.
  //
  // Losing that race costs this reaper NOTHING, and that is a property it has
  // and `killTree` does not: it identifies its target by the TARGET'S OWN ARGV,
  // which is fixed at the target's exec and is unaffected by the directory
  // disappearing underneath it. `pgrep -f` matches the command line the kernel
  // recorded, not a path that must still resolve. Plan 08-10 records the
  // completion-order residual as AR-05.
  reapMcpOrphans(
    sdk,
    buildSessionOrphanScanPlan({
      platform: host?.platform,
      sessionDirName: getMcpSessionDirName(),
    }),
    [],
  );

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

// Kill, then remove, the residue a previous run that did not stop cleanly
// (crash, hard kill, Caido force-quit) left behind: first every still-running
// `mcp-server.mjs` staged from a drift-mcp-* directory, then the drift-mcp-*
// directories themselves. Both halves are credential exposure — the directories
// hold the token-bearing MCP config documents, and a surviving MCP process holds
// that same Caido bearer token in its MEMORY, where no file removal can reach
// it. Safe to run here: startMcpServer is only entered when MCP is not already
// running, so any existing drift-mcp-* dir other than the (about-to-be-replaced)
// current one is genuinely orphaned.
//
// THE PROCESS HALF IS NEW, AND IT CLOSES AR-02 / recorded decision OQ-3. Until
// this plan the sweep reached directories only, which is exactly the gap
// `08-SECURITY.md` AR-02 names: a hard-killed Caido left a token-bearing
// `mcp-server.mjs` alive with its context file deleted underneath it, so the
// forensic trail (which pid, which session, which policy) was destroyed while
// the bearer token in that process's memory stayed valid for the whole of the
// user's Caido session. Deleting a token-bearing file is not revocation.
//
// OQ-3 DEFERRED THIS ON BLAST RADIUS, AND THAT OBJECTION IS ANSWERED RATHER THAN
// WAIVED. It read: "identifying a Drift MCP process from a previous run requires
// image-name matching that could terminate an unrelated `node`." The pattern
// `buildPreviousRunOrphanScanPlan` composes is NOT image-name matching — it
// requires the `drift-mcp-` prefix, an 8-to-64 lowercase-hex token, a path
// separator and `mcp-server.mjs`, ALL ADJACENT, on one command line. A `node`
// process not started out of a drift-mcp directory cannot satisfy it, and
// `pgrep -f` is handed a pattern whose every character came from a shape the
// pure module validated (T-08-21 / T-08-22).
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
  // KILL BEFORE REMOVE — the SC-4 statement order this file already applies at
  // `cleanupMcpRuntime`, `closeCliSession` and `deleteChat`, extended to the one
  // removal site that had no termination above it at all. The directories the
  // loop below removes are the env-source documents that carried CAIDO_TOKEN
  // into these very processes; removing them first destroys the evidence and
  // withdraws nothing.
  //
  // ONE SCAN FOR THE WHOLE SWEEP, NOT ONE PER DIRECTORY, for two independent
  // reasons and both are load-bearing:
  //
  //   1. The class pattern reaches an orphan whose directory a PREVIOUS sweep
  //      ALREADY REMOVED. That is AR-02 in its purest form — the process is
  //      still alive holding the token, and there is no directory left to
  //      iterate over, so a per-directory scan would never look for it.
  //   2. One enumerator spawn is one enumerator spawn regardless of how many
  //      residue directories exist. A per-directory scan would multiply spawns
  //      by residue count for no additional reach.
  //
  // WHY `getMcpSessionDirName()` IS A GUARD AND NOT A PARAMETER. The builder
  // REFUSES with `session-active` whenever that value is defined. This call sits
  // above the point where `mcpTempDir` is assigned, so today it reads
  // `undefined` and the class-wide scan proceeds. If a future edit ever moves it
  // below that assignment, the scan STOPS HAPPENING instead of starting to match
  // the live session's own MCP child — the failure resolves toward not killing.
  // The guard lives in `kill-plan.ts`, where `kill-plan.test.ts` reaches it; this
  // call site only supplies the value.
  //
  // NOT AWAITED, for the reason `killTree` and the teardown reap are not: this
  // function is called from inside an RPC handler, and awaiting a child-process
  // callback there is the event-loop starvation anti-pattern CLAUDE.md names.
  // What this statement's POSITION guarantees is that the scan is issued before
  // any `rm`; the COMPLETION order is not enforced, and plan 08-10 records that
  // residual as AR-05. Losing that race costs this reaper nothing — `pgrep -f`
  // matches the command line the kernel recorded at exec, not a path that must
  // still resolve.
  reapMcpOrphans(
    sdk,
    buildPreviousRunOrphanScanPlan({
      platform: host?.platform,
      currentSessionDirName: getMcpSessionDirName(),
    }),
    [],
  );

  for (const root of getSweepRoots(hostFacts)) {
    try {
      const entries = await readdir(root);
      await Promise.all(
        entries
          .filter((name) => name.startsWith(MCP_TEMP_DIR_PREFIX))
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

  // Its sibling, and deliberately adjacent: "clean up other people's residue at
  // startup" now has ONE home rather than two. The orphan sweep above covers
  // the temp root; this one covers the two external CLIs' own configuration
  // files, which live outside it and which no Drift release before this one
  // ever swept.
  //
  // ORDER: before tryRegisterMcpForProviders below, so a stale entry is gone
  // before a fresh one is written and the window between the two does not widen.
  await sweepStaleMcpCliRegistrations(sdk);

  // Stage the MCP runtime under the resolved temp root rather than under the
  // plugin asset path - the Caido plugin path has spaces ("Application Support")
  // which breaks Claude Code's --mcp-config path parsing.
  //
  // 0o700 is REQUESTED here and ASSERTED below, because requesting it is not
  // enough: mkdir(recursive) does not apply `mode` to a directory that already
  // exists, so on a shared /tmp the "other local users cannot read the
  // token-bearing config files written inside" property holds only for
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
    `${MCP_TEMP_DIR_PREFIX}${genShortToken()}`,
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
  //
  // THE STAGED COPY IS THE MOST SEVERE of the five temp-directory writes, and it
  // is NOT the one G-05 was filed against — which is why the gap asked its
  // question in the general form rather than at the one site someone looked at.
  // This file is CODE: the launch path runs it under node with `CAIDO_TOKEN` in
  // its environment, so a locally writable copy is local code execution carrying
  // that token. Everything below it in severity is disclosure; this one is
  // execution.
  //
  // NO EXECUTE BIT — owner read/write only, never owner-all. `mcp-server.mjs` is
  // READ by the node process that runs it and is never executed by the operating
  // system, so an execute bit would be a permission granted for no purpose.
  //
  // THE WINDOWS TRADE-OFF, recorded here rather than left implicit (T-08-43).
  // POSIX mode bits are ignored on Windows, so none of the five owner-only
  // options this file now states changes anything there. What protects these
  // files on Windows instead is that os.tmpdir() resolves to the per-user temp
  // directory beneath the user's profile — AppData\Local\Temp — which Windows
  // already ACLs to that user. That is the Windows-appropriate equivalent
  // CLAUDE.md's file-permission constraint asks for; it holds by construction
  // rather than by anything Drift does. This is therefore an ACCEPTED trade-off,
  // not an open hole, and it is written down because the constraint asks for
  // either an equivalent or an explicit acceptance, and this is the acceptance.
  const written = await withFsRetry(
    async () => {
      await mkdir(tempDir, { recursive: true, mode: 0o700 });
      await writeFile(mcpScriptLocal, await readFile(mcpScript, "utf-8"), {
        mode: 0o600,
      });
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
  // Since Phase 7 the helper registers on EVERY platform: it writes no shell
  // script, spawns no permission-bit step, and passes the environment through
  // each CLI's own `-e`/`--env` surface instead (PRV-03).
  await tryRegisterMcpForProviders(spec.value, sdk);
  cliSessions.clear();

  await publishMcpStatus(sdk);

  return ok(await buildCurrentMcpStatus());
}

async function stopMcpServer(sdk: BackendSDK): Promise<Result<void>> {
  // SC-4 is satisfied here BY DELEGATION and nothing needs to be added: the
  // kill-every-tracked-pid-before-the-sweep loop lives inside cleanupMcpRuntime,
  // so this path inherits it — as does startMcpServer's failure path, which is
  // the half a fix written at this button would have missed.
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

async function deleteChat(sdk: BackendSDK, chatId: string): Promise<Result<void>> {
  await dataReady;
  currentChats = currentChats.filter((c) => c.id !== chatId);
  cliSessions.delete(chatId);
  for (const [sessionId, snapshot] of sessionSnapshots.entries()) {
    if (snapshot.chatId !== chatId) continue;
    const proc = activeProcesses.get(sessionId);
    if (proc !== undefined) {
      // SC-4 / LIF-01 / LIF-02, and here the ORDER is the control rather than
      // the call. This termination must stay ABOVE the sessionRuntimeFiles
      // block that follows: those files are what carried the Caido token into
      // the MCP child's environment, and removing them while that child is
      // still running destroys the evidence — which pid, which session, which
      // policy — while leaving the capability untouched, because the token
      // lives in the process's memory and not in the file it arrived through.
      // Deleting a token-bearing file is not revocation; killing the process
      // that read it is. Do NOT move the removal block back above this.
      //
      // The FORCEFUL rung, deliberately: a chat is being deleted, so there is
      // no partial output left for anyone to read, and Windows has no graceful
      // rung in any case.
      killTree(sdk, proc, "kill");
      activeProcesses.delete(sessionId);
      // LIF-02 without A6. `killTree` reached the provider CLI; whether its
      // signal reached the CLI's `mcp-server.mjs` child depends on a process-group
      // assumption UAT measured FALSE. This reaches that child by its own argv —
      // but only once this deletion has left Drift with no session at all, which
      // is what stops it from killing a concurrent session's child (T-08-27).
      reapSessionOrphansIfIdle(sdk);
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
  if (!isProviderUsable(status)) {
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
    //
    // LIF-01 — RESOLVED BY PHASE 8, AND RESOLVED BY COSTING NOTHING HERE. Phase 7
    // marked this spot because on Windows the interpreter branch above inserts a
    // `cmd.exe` level, so the tree this session must later terminate is one
    // deeper than on POSIX. Phase 8's answer is that the extra level is free:
    // buildKillTreePlan's win32 arm emits `taskkill.exe /pid <n> /t /f`, and `/t`
    // is documented as ending "the specified process and any child processes
    // started by it" — it walks the ParentProcessId relation recorded in the
    // process table, RECURSIVELY, and is therefore depth-independent. That is
    // precisely why nothing at this site had to reorder, terminate or change:
    // one more level of parentage costs the mechanism nothing.
    //
    // THE RESIDUAL, NAMED RATHER THAN HIDDEN. The walk can only follow parentage
    // that still exists. If the intermediate `cmd.exe` has ALREADY EXITED, its
    // surviving children are no longer reachable from the tracked pid and are not
    // terminated (08-RESEARCH.md § /T's documented blind spot, Pitfall 5,
    // assumption A3 — community/issue-tracker evidence only, so it is stated as
    // such rather than as a measurement). Two facts size it: `cmd.exe /c`
    // normally waits for its child, so the window is narrow but not zero; and
    // Phase 6 already prefers a real `.exe` over a `.cmd` shim, which removes
    // this level entirely wherever a native install exists.
    //
    // That residual is ACCEPTED, not mitigated — recorded as 08-SECURITY.md
    // AR-01 — because the correct primitive is a Windows Job Object, which
    // neither LLRT nor Node exposes without a native addon, and native addons are
    // banned by the QuickJS runtime constraint.
    const spawnPlan = buildSpawnPlan({
      command: resolved,
      args,
      platform: host?.platform,
      comspec: getComspec(),
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
            // RESIDUAL, owner PHASE 9 (G-01) — the CLI child's own block, and
            // the second half of the same question. Empty on a real install;
            // see readParentEnv's header for why that is a degradation rather
            // than the bare-name spoofing surface 08-08 fixed.
            parentEnv: readParentEnv(),
            driftVars: injectedDriftVars,
          }),
          stdio: ["pipe", "pipe", "pipe"],
          // Taken from the plan, never hardcoded: it is true exactly when the
          // plan assembled and escaped a cmd.exe command line itself, and false
          // on every direct spawn (all of POSIX, and a Windows `.exe`).
          windowsVerbatimArguments: spawnPlan.windowsVerbatimArguments,
          // LIF-02, and the ONE site in this file that says anything other than
          // false. The provider CLI spawns `node mcp-server.mjs` as its own
          // child, and that grandchild carries CAIDO_TOKEN. Giving the CLI its
          // own process group is what makes the grandchild reachable from a
          // single group signal when the user clicks Stop; without it the
          // grandchild survives EVERY cancel, which is the defect LIF-02 names.
          //
          // Rated `costly`, not free: on POSIX the CLI stops receiving signals
          // delivered to Caido's own group, so a terminal Ctrl-C on Caido no
          // longer takes it down (08-RESEARCH.md § Pitfall 6). Caido ships as a
          // desktop application rather than a foreground job, and the
          // counterweight — a token-bearing orphan after every cancel — is
          // decisive. `shouldDetachProviderSpawn` returns false on win32, where
          // `taskkill /t` walks parentage instead and LLRT's flag would perturb
          // the console-attachment contract Phase 7 measured.
          detached: shouldDetachProviderSpawn(host?.platform),
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
      // HANDLE IDENTITY for the deferred forceful rung (review CR-02). Set from
      // the handle's OWN `close`/`exit` handlers below — only the process this
      // turn spawned can flip it, which is what distinguishes it from the pid,
      // a number the OS is free to hand to a stranger. It is a closure flag
      // rather than a `once("exit")` registered at scheduling time on purpose:
      // `requestGracefulShutdown` is reachable from four call sites and can fire
      // repeatedly within one turn, so a listener per schedule would accumulate
      // on the emitter. Deliberately NOT reset anywhere — a process that has
      // exited does not un-exit.
      let providerProcessExited = false;
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
        // THE SINGLE FUNNEL — every normal completion AND the absolute timeout
        // reach `finalize`, so this is where a turn that ended by itself gets the
        // same orphan reap a cancel gets. A normal exit is exactly as capable of
        // leaving a token-bearing `mcp-server.mjs` behind as a cancel is, because
        // the child is not in `activeProcesses` either way.
        //
        // THE COST, RECORDED RATHER THAN GLOSSED: this fires after EVERY completed
        // turn, not only after a cancel, so an otherwise-idle Drift spawns one
        // short-lived enumerator per turn. That is deliberate (T-08-32, accepted).
        // The enumerator is bounded by ORPHAN_SCAN_TIMEOUT_MS, is fire-and-forget,
        // and exits immediately with no match when there is nothing to reap. The
        // cost is ZERO on Windows, where `buildSessionOrphanScanPlan` refuses with
        // `unsupported-platform` before any spawn happens — so UX-04's
        // console-window count is unaffected.
        reapSessionOrphansIfIdle(sdk);
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
        // Pitfall 10, and it names which of the next two statements is the
        // movable one. The KILL moved UP; `finalize` did NOT move and must not:
        // it is a `const` arrow declared LOWER in this same promise executor, so
        // hoisting it to this position puts it in its temporal dead zone and
        // calling it throws a ReferenceError synchronously inside the executor —
        // the exact bug already recorded above at the spawn guard. Reorder these
        // two and you get a rejected promise instead of a timed-out turn.
        //
        // Why the kill goes first at all (SC-4): `finalize` removes the activity
        // and approvals files that carried the Caido token into the MCP child's
        // environment. The tree that was reading them dies before they vanish.
        killTree(sdk, proc, "kill");
        finalize(err("Process timed out"));
      }, currentSettings.processTimeoutSeconds * 1000);

      const requestGracefulShutdown = () => {
        appendSessionDebugLog(sessionDebugLogPath, "requestGracefulShutdown(): SIGTERM");
        // Captured BEFORE the timer is scheduled, for the GUARD below (§
        // Pitfall 2): by the time the deferred rung runs the child may have been
        // reaped and the number reassigned. This comment used to claim the pid
        // was "never re-read from `proc` inside it", and that was false as
        // written — the callback calls `killTree`, whose first statement reads
        // `proc.pid` again, and Node does not clear `pid` after reaping
        // (measured: the original number is still returned after `exit`). The
        // capture is therefore worth nothing against reassignment on its own,
        // which is why the guard below leads with a HANDLE-identity check
        // (review CR-02) rather than with this number.
        const shutdownPid = proc.pid;
        // PITFALL 4 — THE SECOND RUNG STAYS, ON BOTH PLATFORMS, AND FOR
        // DIFFERENT REASONS ON EACH. On POSIX the two rungs are genuinely
        // different signals to the process group: the first lets the CLI flush
        // the partial output the frontend surfaces, the second collects whatever
        // ignored it. On win32 both build the IDENTICAL forceful plan, because
        // Windows has no graceful rung — so the second rung there is a
        // deliberate RE-ISSUE against a pid that has normally already gone, not
        // an inert repeat. Do not delete it as redundant, and do not "restore
        // symmetry" by turning it back into a direct signal on the child handle:
        // under LLRT that handle's win32 arm consumes its sender on first use,
        // so the ladder would read graceful-then-forceful while being
        // forceful-then-nothing.
        killTree(sdk, proc, "term");
        setTimeout(() => {
          // GUARDED FIRST, so the debug line below cannot claim a signal that
          // was never sent. Two checks, in this order, and the ORDER is the
          // fix (review CR-02).
          //
          // IDENTITY BEFORE LIVENESS. `hasTrackedProcessExited` reads the
          // HANDLE — the `exit` event it emitted, plus Node's exit-state
          // properties where the runtime has them — so it answers "has the
          // process WE spawned finished", which is the question T-08-04 actually
          // needs. `isPidAlive` alone cannot answer it: signal 0 reports a
          // REASSIGNED pid as alive, so the only case it discriminated was the
          // harmless dead-and-not-yet-reused one, and it passed in exactly the
          // dangerous one. On Windows the forceful plan would then take an
          // unrelated process's WHOLE tree.
          //
          // `isPidAlive` is kept as the secondary check, not deleted: under
          // Caido's LLRT the handle carries no exit state at all and the `exit`
          // event may not have been delivered yet, so liveness is the only
          // answer left there. An unprovable liveness answer resolves toward
          // "alive", so neither check can ever ADD a kill.
          //
          // ACCEPTED RESIDUAL, stated rather than papered over: on POSIX a
          // process group outlives its leader, so a handle that has exited while
          // group members survive skips a group kill that would still have
          // worked. That was already true of the `isPidAlive` guard this phase
          // shipped — a dead leader answers signal 0 with `false` — so this does
          // not widen it. Closing it needs an identity-bearing group reference
          // the runtime does not expose.
          if (
            hasTrackedProcessExited({
              observedExitEvent: providerProcessExited,
              ...readHandleExitState(proc),
            })
          ) {
            return;
          }
          if (shutdownPid === undefined || !isPidAlive(shutdownPid)) return;
          appendSessionDebugLog(sessionDebugLogPath, "requestGracefulShutdown(): SIGKILL");
          killTree(sdk, proc, "kill");
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
        providerProcessExited = true;
        sdk.console.log(`[drift watchdog] proc.close fired sessionId=${input.sessionId} code=${String(code)}`);
        appendSessionDebugLog(sessionDebugLogPath, `process close code=${String(code)}`);
        finalizeFromProcessEnd(code, "close");
      });

      proc.on("exit", (code, signal) => {
        // BEFORE the `settled` early-return below, and that ordering is the
        // whole value of the flag: a turn that has already settled is exactly
        // when a deferred forceful rung is still pending against a pid the OS
        // may have reassigned (review CR-02).
        providerProcessExited = true;
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

// ── Process lifecycle (LIF-01 / LIF-02) ─────────────────────────────
//
// PLACEMENT IS DELIBERATE AND LOAD-BEARING. This section sits BELOW
// `sendCliMessage`'s absolute-timeout handler — below the closing line of the
// setTimeout whose delay is currentSettings.processTimeoutSeconds — so that the
// declaration of `killTree` below can never fall inside a line-scan of that
// handler. Phase 8's SC-4 ordering gate slices exactly that region and asserts
// that the kill statement precedes `finalize`; a declaration sitting above it
// would let the gate match the declaration line and pass without ever measuring
// the statement order it exists to measure. Do not move this section up.
//
// Neither this comment nor any other in this section spells that handler's
// closing line or the tree-kill call shape verbatim: both are addressed by
// line-number and occurrence-count gates that a quoted copy would silently
// shift. Describe them; do not reproduce them.

// A positive-pid signal-0 liveness probe, read through the same guarded
// `globalThis` shape as `readParentEnv` (:564) and `readVersionBlock` (:316) —
// never a bare `process.` reference, which is a ReferenceError rather than an
// `undefined` in a runtime that does not declare the global. Signal `0` sends
// nothing; it performs the existence and permission checks only.
//
// A THROW IS NOT PROOF OF DEATH. On unix an EPERM — the pid exists but belongs
// to another user — throws exactly as ESRCH does, so `false` here means "not
// provably alive" rather than "gone". That asymmetry is the safe direction for
// the only caller: a deferred kill rung skips when this returns `false`, so the
// worst case is a signal not sent, never a signal sent at an unrelated process
// (08-RESEARCH.md § Pitfall 2).
//
// If the runtime exposes no kill primitive at all the probe cannot run, and this
// returns `true` — "not proven dead". That keeps the guard strictly subtractive
// relative to the behaviour that ships today, where the deferred rung fires
// unconditionally: this function can only ever REMOVE a kill, never add one
// (CMP-01).
//
// ── THE TWO RUNTIME FACTS THIS BODY EXISTS TO SURVIVE (review WR-03) ──
//
// The version this replaces reasoned only about "the runtime exposes no kill
// primitive at all". Both of the failures that actually apply are about a
// primitive that EXISTS and answers differently, and neither is observable from
// any CI leg, because every leg runs Node.
//
// FACT 1 — LLRT ANSWERS `false` WHERE NODE THROWS. Source-verified:
// `caido/dependency-llrt` branch `caido`, `modules/llrt_utils/src/signals.rs`
// (`kill`) maps a signal-0 call at a missing pid to `Ok(false)` — the ESRCH /
// failed-OpenProcess case is explicitly converted to a RETURN VALUE rather than
// an exception. Node's `process.kill(pid, 0)` throws ESRCH instead. So a
// try/catch that ignores the return value reads "alive" for EVERY pid under
// Caido, and the T-08-04 guard it feeds is silently inert on every real install
// while behaving correctly in CI. The result is therefore read as well as
// caught: `false` from the primitive is a NEGATIVE answer, not a success.
//
// FACT 2 — THE SELF-PID IS SPELLED DIFFERENTLY ON EACH RUNTIME. Node exposes
// `process.pid`; LLRT's process module sets `id` (`llrt_process`: `process.set(
// "id", std::process::id())`) and declares no `pid` at all. Both are read, in
// that order. This matters because of the calibration below, which is useless if
// it cannot name a pid that is certainly alive.
//
// THE CALIBRATION, and why it resolves toward "alive". Signalling OURSELVES with
// `0` must succeed on any runtime whose kill primitive accepts this call shape.
// If that throws, or answers `false`, the PROBE is unusable — it says nothing
// about the target — so the answer is `true` ("not proven dead") and the
// deferred rung keeps the unconditional behaviour that shipped in 0.1.0. Without
// it, a primitive that rejects this shape would return `false` for every pid
// forever and disable the forceful rung on every install: a CMP-01 POSIX
// regression no CI leg can observe.
//
// Every arm above resolves an UNKNOWN toward "alive". That direction is the
// safety property, and it is what lets this guard be added at all.
// The I/O boundary for `hasTrackedProcessExited` (kill-plan.ts): two property
// reads off the child handle, and nothing else.
//
// THE CAST IS THE POINT, not a nuisance to be tidied away. `tsc --noEmit`
// REJECTS `proc.exitCode` in this package, because the ambient type this
// codebase compiles against is Caido's `@caido/quickjs-types`
// `child_process.d.ts`, which declares `pid`, `kill` and the stream/emitter
// surface and no exit state at all — matching LLRT's own class definition. That
// rejection is the compiler reporting a real runtime fact: the property is
// absent on the runtime users actually run, so the read yields `undefined`
// there, and the pure decision treats `undefined` as "not proven exited" for
// exactly that reason. Do NOT "fix" this by widening the ambient declaration:
// widen it and the next reader believes the property exists, writes
// `exitCode !== null`, and silently disables the forceful rung on every real
// install while every CI leg stays green (review CR-02).
function readHandleExitState(proc: ChildProcessWithoutNullStreams): {
  exitCode: number | null | undefined;
  signalCode: string | null | undefined;
} {
  const handle = proc as unknown as {
    exitCode?: number | null;
    signalCode?: string | null;
  };
  return { exitCode: handle.exitCode, signalCode: handle.signalCode };
}

function isPidAlive(pid: number): boolean {
  const processRef = globalThis as typeof globalThis & {
    process?: {
      pid?: number;
      id?: number;
      kill?: (pid: number, signal: number) => boolean;
    };
  };
  const killRef = processRef.process?.kill;
  if (typeof killRef !== "function") return true;

  // `pid` is Node's spelling, `id` is LLRT's. Neither runtime has both.
  const selfPid = processRef.process?.pid ?? processRef.process?.id;
  if (typeof selfPid !== "number") return true;

  try {
    // Calibration. A throw OR a `false` here means the probe cannot answer, not
    // that anything is dead.
    if (killRef.call(processRef.process, selfPid, 0) === false) return true;
  } catch {
    return true;
  }

  try {
    // `!== false` rather than a bare `true`: Node returns `true` or throws,
    // LLRT returns a boolean. Both are handled by reading the value.
    return killRef.call(processRef.process, pid, 0) !== false;
  } catch {
    return false;
  }
}

// Bring down a tracked child AND everything it spawned. The one place in this
// file that terminates a process tree.
//
// FIRE-AND-FORGET BY CONSTRUCTION (recorded decision OQ-4, 08-RESEARCH.md §
// Pitfall 7). It returns `void`, awaits nothing, and no caller's signature
// changes. Every caller is on a cancel/close/timeout path, and Caido's runtime
// does not deliver child_process callbacks while an RPC is awaiting — so
// awaiting a kill inside a cancel would open a new instance of the exact
// starvation class the whole keep-alive/watchdog apparatus exists to work
// around, at the worst possible moment. SC-5's "cancellation semantics visible
// to the user are unchanged" then holds by construction rather than by test. Do
// not make this async.
//
// The killer is spawned through the BARE `spawn`, not `spawnWithEnv`: it
// inherits the parent block correctly and has no reason to carry a DRIFT
// variable, and every environment handed to a child process is enumerated by a
// gate that should not have to carry a row for a spawn that needs none.
//
// LOG LINES ARE VALUE-FREE (threat T-08-05, the T-04-04 rendering rule): the
// plan's kind/reason, an exit code, an error code and the platform — scalars
// only. No path, no argv, no environment value, and never the pid rendered at
// this site, because `String(undefined)` is the word "undefined" and a killer
// invoked with it is a silent no-op nobody reads (§ Pitfall 3). The rendering
// lives in kill-plan.ts, behind its guard.
// The win32 LAST RESORT, and only that. `killTree`'s preamble rung is guarded
// off win32 (review CR-01) because a `TerminateProcess`d pid is invisible to
// `taskkill /t`'s `ParentProcessId` walk. That leaves one Windows case with no
// killer at all: `taskkill.exe` could not be SPAWNED — no `%SystemRoot%`, so the
// plan fell back to a bare name that `%PATH%` does not resolve, or the spawn
// threw synchronously. Before the guard, the tracked process died anyway on that
// path; this restores exactly that and nothing more.
//
// It is FORCEFUL unconditionally, and the rung is deliberately not threaded in:
// there is no graceful signal on Windows (`kill-plan.ts` refuses to build one),
// and by the time this runs the tree killer has already failed, so the only
// remaining question is whether the tracked process dies at all.
//
// Written as a named function rather than inline at both arms so the
// termination census in `index.source.test.ts` has ONE site to enumerate for
// this behaviour instead of two identical ones.
function killWin32Leaf(proc: ChildProcessWithoutNullStreams): void {
  if (host?.platform !== "win32") return;
  try {
    proc.kill("SIGKILL");
  } catch {
    /* already dead */
  }
}

function killTree(
  sdk: BackendSDK,
  proc: ChildProcessWithoutNullStreams,
  rung: KillRung,
): void {
  // Captured ONCE, here. Reading `proc.pid` again inside a deferred rung is
  // Pitfall 2 (pid reuse) — by then the process may have been reaped and the
  // number reassigned.
  const pid = proc.pid;

  // THE SINGLE-PID RUNG, FIRST ON POSIX, AND IT IS NOT REDUNDANT THERE. On
  // POSIX this is the behaviour that ships today, kept deliberately as defence
  // against assumption A1 — that the Caido LLRT users actually run honours the
  // process-group spawn option.
  //
  // SUPERSEDED (written 2026-08-24), preserved as a block quote rather than
  // overwritten, per the marked-correction convention this phase uses:
  //
  // > A1 reads **OPEN — not measured** in 08-SPIKE.md: the Wave-0 probe that
  // > would have closed it was built and then waived without being run. If
  // > `detached` silently does nothing on a real install, the group reference in
  // > the plan below names a group that was never created and NOTHING dies; this
  // > rung turns that total regression into the partial one we have today.
  //
  // CORRECTION (2026-08-27, probe build installed in a real macOS Caido, darwin
  // 25.6.0): **A1 IS CLOSED FAVOURABLY.** `spikeDetachedGroupKill` read
  // `grandchild-died (detached honoured)` — the shipped LLRT does honour the
  // detached spawn option, so the group reference in the plan below names a
  // group that really exists. The failure this rung was written against did not
  // occur.
  //
  // THE RUNG STAYS ANYWAY, and its justification is corrected rather than
  // dropped: it is no longer defence against an UNMEASURED runtime, it is
  // defence against a FUTURE Caido that rebases its LLRT fork. One measurement
  // closes a version, not a dependency. It costs one syscall. Recorded decision
  // OQ-2 — do not delete it as redundant.
  //
  // It is also not, and never was, a defence against A6, which the same reading
  // measured FALSE: a provider CLI's `mcp-server.mjs` child can sit in its OWN
  // process group, where neither this rung (which signals the CLI) nor the group
  // kill below (which signals the CLI's group) reaches it. That class is handled
  // by `reapMcpOrphans` above, which signals positive single pids.
  //
  // WIN32 IS EXCLUDED, AND THE EXCLUSION IS THE FIX FOR WHAT THIS RUNG WAS
  // DOING THERE (review CR-01). A1 is a POSIX assumption in the first place —
  // it is about `process_group(0)`, an option the win32 arm never takes — so
  // this rung was never A1 defence on Windows. What it was instead was a
  // defeat of the plan below. `proc.kill(...)` on win32 is an unconditional
  // `TerminateProcess` whatever signal name it is handed; that is the same fact
  // `kill-plan.ts` relies on when it refuses to build a graceful win32 rung.
  // So the tracked process left the process table microseconds before
  // `taskkill /pid <n> /t /f` was spawned to walk its `ParentProcessId`
  // children — and `taskkill` cannot enumerate a process that is already gone.
  // The token-bearing `node mcp-server.mjs` grandchild then survived the
  // cancel: LIF-01/LIF-02 unfixed on the one platform this milestone is about.
  // The deferred second rung did not rescue it either — it is guarded on the
  // pid's liveness, and this rung had just made that answer `false`.
  //
  // The single-pid signal is KEPT on win32, but as the FALLBACK at the two
  // spawn-failure arms below rather than as the preamble, so a Windows host
  // whose `taskkill.exe` cannot be spawned at all still loses the tracked
  // process — the behaviour that shipped before this rung was guarded.
  if (host?.platform !== "win32") {
    try {
      proc.kill(rung === "kill" ? "SIGKILL" : "SIGTERM");
    } catch {
      /* already dead */
    }
  }

  const plan = buildKillTreePlan({
    pid,
    platform: host?.platform,
    env: readParentEnv(),
    // G-01, the reported gap. That environment is EMPTY on a real install, so
    // the win32 arm reached its bare-name constant on every one — the form
    // SC-1 permits only as a last resort and T-08-03 exists to prevent.
    systemRootFallback: getWindowsSystemRootFallback(),
    rung,
  });

  if (plan.kind === "none") {
    sdk.console.log(`[drift lifecycle] no tree kill: ${plan.reason}`);
    return;
  }

  // C-8 / § Pitfall 9: `spawn()` throws SYNCHRONOUSLY for an unspawnable path,
  // and the realistic case here is a Windows host with no %SystemRoot% at all,
  // where the plan falls back to a bare name. A throw escaping into a cancel
  // handler that has no catch would surface as a failed RPC on a Stop button.
  try {
    const killer: ChildProcessWithoutNullStreams = spawn(plan.file, plan.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsVerbatimArguments: plan.windowsVerbatimArguments,
    });
    // Drained and discarded so neither pipe can fill and stall the killer. This
    // process is stored in no map: nothing waits on it and nothing cancels it.
    killer.stdout?.on("data", () => undefined);
    killer.stderr?.on("data", () => undefined);
    // A non-zero exit is the EXPECTED case as often as not — the target
    // frequently exits between the decision and the spawn. Logged, never
    // branched on: taskkill's codes are undocumented by Microsoft and unmeasured
    // by this project, and `kill`'s "no such process" is the normal race.
    killer.on("close", (code) => {
      sdk.console.log(`[drift lifecycle] tree kill exited code=${String(code)}`);
    });
    killer.on("error", (error: Error & { code?: string }) => {
      // The errno CODE only. `error.message` embeds the resolved file path
      // ("spawn taskkill.exe ENOENT"), and a path is one of the things a
      // lifecycle line must not carry (T-08-05).
      sdk.console.log(
        `[drift lifecycle] tree kill spawn error code=${String(error.code ?? "unknown")}`,
      );
      killWin32Leaf(proc);
    });
  } catch {
    // Same rule: the thrown value's message carries the path, so only the
    // platform scalar is rendered.
    sdk.console.log(
      `[drift lifecycle] tree kill threw synchronously platform=${String(host?.platform ?? "unknown")}`,
    );
    killWin32Leaf(proc);
  }
}

function cancelCliMessage(sdk: BackendSDK, sessionId: string): Result<void> {
  const proc = activeProcesses.get(sessionId);
  const snapshot = getSessionSnapshot(sessionId);
  if (proc !== undefined) {
    // Captured BEFORE the timer is scheduled, for the GUARD below (§ Pitfall
    // 2). This comment used to claim the pid was "never re-read from `proc`
    // inside it"; that was false as written, because the callback calls
    // `killTree`, whose first statement reads `proc.pid` again, and Node does
    // not clear `pid` after reaping. See the identity check in the callback
    // (review CR-02) for what actually carries the guarantee.
    const pid = proc.pid;
    // HANDLE IDENTITY, the counterpart of `sendCliMessage`'s closure flag: this
    // function only has the handle, not that turn's closure. Exactly ONE
    // listener is registered per session because `activeProcesses.delete` runs
    // below, so a second Stop for the same session never reaches here.
    let cancelledProcessExited = false;
    proc.once("exit", () => {
      cancelledProcessExited = true;
    });
    // LIF-02. Was a bare `proc.kill("SIGTERM")`, which signals the provider CLI
    // alone and leaves its `node mcp-server.mjs` child — the process holding
    // CAIDO_TOKEN — running until it decides to exit. Consent withdrawal that
    // does not withdraw the credential is not consent withdrawal.
    killTree(sdk, proc, "term");
    setTimeout(() => {
      // GUARDED, and the guard is the point. `activeProcesses.delete` has
      // already run, the tree may be entirely gone, and the OS is free to
      // reassign the pid in the meantime — on Windows the same argv would then
      // take an unrelated process's WHOLE TREE with it (§ Pitfall 2, threat
      // T-08-04).
      //
      // IDENTITY BEFORE LIVENESS, the same order and for the same reason as
      // `requestGracefulShutdown`'s rung, which carries the full argument:
      // signal 0 reports a REASSIGNED pid as alive, so `isPidAlive` on its own
      // discriminated only the harmless case and passed in the dangerous one
      // (review CR-02). The handle's `exit` event and Node's exit-state
      // properties cannot be answered by a stranger holding the same number.
      // Neither check can ever add a kill, only skip one.
      if (
        hasTrackedProcessExited({
          observedExitEvent: cancelledProcessExited,
          ...readHandleExitState(proc),
        })
      ) {
        return;
      }
      if (pid === undefined || !isPidAlive(pid)) return;
      killTree(sdk, proc, "kill");
    }, 3000);
    activeProcesses.delete(sessionId);
    // THE REPORTED BUG, CLOSED HERE. One turn, click Stop, and the token-bearing
    // `mcp-server.mjs` kept running: `killTree` above signals the provider CLI's
    // process GROUP, and A6 — "the CLI's MCP child sits in the CLI's group" — was
    // measured FALSE on 2026-08-27. This reaches that child by its own argv
    // instead, with no group reference anywhere on the path (GD-01).
    //
    // Placed AFTER the deletion, which is what makes the gate answer correctly:
    // `shouldReapSessionOrphans` reads `activeProcesses.size`, and reaping before
    // this session had been removed from it would refuse on the very session
    // being cancelled.
    //
    // FIRE-AND-FORGET, returning `void`: this function keeps its synchronous
    // `Result<void>` signature (OQ-4) and its user-visible semantics unchanged.
    reapSessionOrphansIfIdle(sdk);
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
    // SC-4 / LIF-01 / LIF-02 — the same ordering contract as deleteChat, and the
    // same reason. The sessionRuntimeFiles block below removes the activity and
    // approvals files that carried the Caido token into the MCP child's
    // environment; removing them while that child is still alive destroys the
    // forensic trail without withdrawing the credential, because the token is in
    // the process's memory rather than in the file. This termination must stay
    // ABOVE that block — do not move the removal back above it.
    //
    // The FORCEFUL rung: the session is being closed, so no partial output is
    // owed to anyone, and Windows has no graceful rung. `killTree` is
    // fire-and-forget, so this function keeps its synchronous Result<void>
    // signature (OQ-4).
    killTree(sdk, proc, "kill");
    activeProcesses.delete(input.sessionId);
    // The same LIF-02 reap as the cancel path, for the same reason and with the
    // same gate: `killTree` reached the CLI, A6 says nothing reliable about
    // whether that reached its MCP child, and this does. Fire-and-forget, so the
    // synchronous `Result<void>` signature above is unaffected (OQ-4).
    //
    // ABOVE the sessionRuntimeFiles removal below, and that placement is the same
    // SC-4 contract this function's header already states: those files carried
    // CAIDO_TOKEN into the child's environment, and removing them while the child
    // still runs destroys the trail without withdrawing the credential.
    reapSessionOrphansIfIdle(sdk);
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

// No Phase 8 Wave-0 spike (A1/A6) ran here. The temporary probe lived at this
// spot on commit 68199fa; the hardware checkpoint that would have EXECUTED it
// against a real Caido install was waived, so A1 and A6 stay OPEN — 08-SPIKE.md.

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
    // SC-3's support-bundle half. Count and scope only — no CLI output, and no
    // path: the same three-scalar rule the security line itself obeys.
    mcpCliRemovalFailures:
      mcpCliRemovalFailures.size === 0
        ? "none"
        : [...mcpCliRemovalFailures.entries()]
            .map(
              ([cli, scopes]) =>
                `${cli}: ${String(scopes.size)} failed (` +
                [...scopes.entries()]
                  .map(
                    ([scope, exitCode]) =>
                      `scope=${scope} exit=${String(exitCode)}`,
                  )
                  .join(", ") +
                ")",
            )
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
    // `available` is KEPT under its existing key so a v2 diagnostics consumer
    // reading this bundle does not break — but it is now DERIVED, which is the
    // concrete form of "the boolean is demoted to a derived detail". The
    // capability level and the limitation sit beside it: three keys where there
    // was one, and the two new ones are the only place a limited provider's
    // state is machine-readable.
    providers: providerStatuses.value.map((status) => ({
      id: status.id,
      available: isProviderUsable(status),
      capability: status.capability,
      limitation: status.limitation,
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
