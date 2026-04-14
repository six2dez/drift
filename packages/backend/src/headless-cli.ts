// Headless LLM runner for the Drift scanner subsystem. Spawns the
// configured CLI (claude-cli in v1) with `-p --output-format
// stream-json`, pipes a single prompt to stdin, and collects the full
// text the model returns. Intentionally NOT using the MCP wrapper
// path — the scanner feeds the LLM its inputs directly and reads
// verdicts, so tools/MCP are unnecessary.
//
// The runner exposes a `pumpScannerJob(jobId)` function that is
// called from inside the `getScannerStatus` RPC handler. That pump
// advances the job's state machine using whatever stdout/close
// events have already landed on the ChildProcess, and decides
// whether to resolve/reject/keep-waiting. This is the same pattern
// used for `sessionWatchdogs` and `activeSelfTestPoll` in index.ts.

import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { Buffer } from "buffer";
import { writeFile } from "fs/promises";
import path from "path";
import {
  consumeClaudePrintChunk,
  createClaudePrintState,
  finalizeClaudePrintOutput,
  type ClaudePrintState,
} from "./claude-print";

export type HeadlessJobResult = {
  jobId: string;
  text: string;
};

export type HeadlessJobError =
  | { kind: "resolve-failed"; message: string }
  | { kind: "spawn-failed"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "exited-without-output"; exitCode: number | null; message: string }
  | { kind: "rejected"; message: string };

type HeadlessJob = {
  jobId: string;
  settled: boolean;
  accumulatedStdout: string;
  debugLines: string[];
  debugLogPath?: string;
  proc: ChildProcessWithoutNullStreams;
  startedAt: number;
  timeoutMs: number;
  resolve: (value: HeadlessJobResult) => void;
  reject: (error: HeadlessJobError) => void;
  claudeState: ClaudePrintState;
  exitCode: number | null;
  exitSignal: string | null;
};

const activeJobs = new Map<string, HeadlessJob>();

const BUILTIN_TOOL_DENY_LIST: readonly string[] = [
  "Bash",
  "Edit",
  "Glob",
  "Grep",
  "MultiEdit",
  "NotebookEdit",
  "Read",
  "Skill",
  "Task",
  "TodoWrite",
  "ToolSearch",
  "WebFetch",
  "WebSearch",
  "Write",
];

export type RunHeadlessCliTurnInput = {
  jobId: string;
  claudeBinaryPath: string;
  prompt: string;
  timeoutMs: number;
  debugLogPath?: string;
};

// Fire a headless turn. Returns a promise that resolves when the
// child finishes OR when `pumpScannerJob` determines the state is
// terminal. The caller is responsible for calling `pumpScannerJob`
// from inside an RPC handler to keep Caido's event loop awake.
export function runHeadlessCliTurn(
  input: RunHeadlessCliTurnInput,
): Promise<HeadlessJobResult> {
  return new Promise<HeadlessJobResult>((resolve, reject) => {
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(
        input.claudeBinaryPath,
        [
          "-p",
          "--verbose",
          "--output-format",
          "stream-json",
          "--disable-slash-commands",
          "--disallowedTools",
          BUILTIN_TOOL_DENY_LIST.join(","),
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    } catch (error) {
      reject({ kind: "spawn-failed", message: String(error) });
      return;
    }

    const handle: HeadlessJob = {
      jobId: input.jobId,
      settled: false,
      accumulatedStdout: "",
      debugLines: [],
      debugLogPath: input.debugLogPath,
      proc,
      startedAt: Date.now(),
      timeoutMs: input.timeoutMs,
      resolve,
      reject,
      claudeState: createClaudePrintState(),
      exitCode: null,
      exitSignal: null,
    };
    activeJobs.set(input.jobId, handle);

    debugAppend(handle, `spawn pid=${String(proc.pid ?? "unknown")}`);
    debugAppend(handle, `prompt (length ${String(input.prompt.length)}):\n${input.prompt}`);

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      handle.accumulatedStdout += text;
      debugAppend(handle, `[stdout] ${text.slice(0, 400)}`);
      handle.claudeState = consumeClaudePrintChunk(handle.claudeState, text);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      debugAppend(handle, `[stderr] ${text.slice(0, 400)}`);
    });

    proc.on("error", (error) => {
      debugAppend(handle, `proc.error ${error.message}`);
      if (handle.settled) return;
      handle.settled = true;
      activeJobs.delete(input.jobId);
      flushDebugLog(handle).finally(() => {
        reject({ kind: "spawn-failed", message: error.message });
      });
    });

    proc.on("exit", (code, signal) => {
      debugAppend(handle, `proc.exit code=${String(code)} signal=${String(signal ?? "")}`);
      handle.exitCode = code;
      handle.exitSignal = signal;
    });

    proc.on("close", (code) => {
      debugAppend(handle, `proc.close code=${String(code)}`);
      handle.exitCode = code;
      pumpScannerJob(input.jobId);
    });

    try {
      proc.stdin.write(`${input.prompt}\n`);
      proc.stdin.end();
    } catch (error) {
      if (!handle.settled) {
        handle.settled = true;
        activeJobs.delete(input.jobId);
        flushDebugLog(handle).finally(() => {
          reject({ kind: "spawn-failed", message: `stdin write failed: ${String(error)}` });
        });
      }
    }
  });
}

// Called from inside getScannerStatus (RPC context) to keep Caido's
// event loop awake and drive the job's state forward. Also enforces
// the per-job timeout.
export function pumpScannerJob(jobId: string): void {
  const handle = activeJobs.get(jobId);
  if (handle === undefined) return;
  if (handle.settled) return;

  const procRef = handle.proc as unknown as {
    exitCode: number | null | undefined;
    signalCode: string | null | undefined;
  };
  const hasExitCode = typeof procRef.exitCode === "number";
  const hasSignalCode =
    typeof procRef.signalCode === "string" && procRef.signalCode !== "";

  const now = Date.now();
  const elapsed = now - handle.startedAt;

  if (elapsed > handle.timeoutMs) {
    handle.settled = true;
    try { handle.proc.kill("SIGKILL"); } catch { /* ignore */ }
    activeJobs.delete(jobId);
    const timeoutMs = handle.timeoutMs;
    void flushDebugLog(handle).finally(() => {
      handle.reject({
        kind: "timeout",
        message: `Headless scanner job ${jobId} timed out after ${String(timeoutMs)}ms`,
      });
    });
    return;
  }

  if (!hasExitCode && !hasSignalCode) {
    return; // still running
  }

  handle.settled = true;
  activeJobs.delete(jobId);

  const finalText = finalizeClaudePrintOutput(handle.claudeState);
  if (finalText.trim() !== "") {
    void flushDebugLog(handle).finally(() => {
      handle.resolve({ jobId, text: finalText });
    });
    return;
  }

  const rawFallback = handle.accumulatedStdout.trim();
  if (rawFallback !== "") {
    void flushDebugLog(handle).finally(() => {
      handle.resolve({ jobId, text: rawFallback });
    });
    return;
  }

  void flushDebugLog(handle).finally(() => {
    handle.reject({
      kind: "exited-without-output",
      exitCode: handle.exitCode,
      message: `Headless scanner job ${jobId} exited with code ${String(handle.exitCode)} without producing output`,
    });
  });
}

export function pumpAllScannerJobs(): void {
  for (const jobId of activeJobs.keys()) {
    pumpScannerJob(jobId);
  }
}

// ── debug helpers ──────────────────────────────────────────────────

function debugAppend(handle: HeadlessJob, line: string): void {
  if (handle.debugLogPath === undefined) return;
  handle.debugLines.push(`[${new Date().toISOString()}] ${line}`);
}

async function flushDebugLog(handle: HeadlessJob): Promise<void> {
  if (handle.debugLogPath === undefined) return;
  if (handle.debugLines.length === 0) return;
  try {
    await writeFile(handle.debugLogPath, handle.debugLines.join("\n") + "\n");
  } catch {
    // best-effort only
  }
}

export function scannerDebugLogPath(jobId: string): string {
  return path.join("/tmp", `drift-scanner-${jobId}.log`);
}
