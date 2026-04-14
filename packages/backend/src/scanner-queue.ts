// Bounded FIFO queue, concurrency semaphore, rate limiter, and
// provider-unavailable cooldown for the Drift scanner subsystem.
// Worker loop drives each dequeued item through the headless CLI
// runner, parses the verdict, optionally creates a Finding via the
// Caido SDK, and streams state updates to the frontend.

import type { ScannerRecentFinding, ScannerStatus } from "shared";

const PROVIDER_COOLDOWN_MS = 60_000;
const FINDING_BUFFER_CAP = 50;

export type QueuePassiveJob = {
  jobId: string;
  kind: "passive";
  enqueuedAt: number;
  host: string;
  requestId: string;
  handler: (context: JobContext) => Promise<void>;
};

export type QueueActiveJob = {
  jobId: string;
  kind: "active";
  enqueuedAt: number;
  host: string;
  requestId: string;
  handler: (context: JobContext) => Promise<void>;
  onResolve: () => void;
  onReject: (error: Error) => void;
};

export type QueueJob = QueuePassiveJob | QueueActiveJob;

export type JobContext = {
  jobId: string;
  emitFinding: (finding: ScannerRecentFinding) => void;
  reportError: (message: string) => void;
  reportProviderMissing: (message: string) => void;
  markAnalyzed: () => void;
};

export type ScannerQueueDeps = {
  onStatusChanged: (status: ScannerStatus) => void;
  onFinding: (finding: ScannerRecentFinding) => void;
  initialStatus: Pick<ScannerStatus, "passiveEnabled" | "activeEnabled" | "frontendEngaged">;
};

export type ScannerQueueConfig = {
  maxConcurrent: number;
  maxPerMinute: number;
  maxPerHostPerMinute: number;
};

type RateBucket = {
  windowStart: number;
  count: number;
};

export type ScannerQueue = {
  enqueue(job: QueueJob): { accepted: true } | { accepted: false; reason: string };
  getStatus(): ScannerStatus;
  setFlags(flags: Partial<Pick<ScannerStatus, "passiveEnabled" | "activeEnabled" | "frontendEngaged">>): void;
  getRecentFindings(): ScannerRecentFinding[];
  clearRecentFindings(): void;
  resetStats(): void;
  updateConfig(next: ScannerQueueConfig): void;
  pump(): void; // called from getScannerStatus RPC to drain work
  recordInvalidVerdict(reason?: string): void;
};

export function createScannerQueue(
  deps: ScannerQueueDeps,
  initialConfig: ScannerQueueConfig,
): ScannerQueue {
  const queue: QueueJob[] = [];
  const inFlight = new Set<string>();
  const recentFindings: ScannerRecentFinding[] = [];
  let config = initialConfig;
  let passiveEnabled = deps.initialStatus.passiveEnabled;
  let activeEnabled = deps.initialStatus.activeEnabled;
  let frontendEngaged = deps.initialStatus.frontendEngaged;
  let analyzed = 0;
  let findingsCreated = 0;
  let invalidVerdicts = 0;
  let lastError: string | undefined;
  let lastAnalysisAt: number | undefined;
  let providerCooldownUntil: number | undefined;
  let globalBucket: RateBucket = { windowStart: Date.now(), count: 0 };
  const hostBuckets = new Map<string, RateBucket>();

  function snapshot(): ScannerStatus {
    const now = Date.now();
    const cooldown =
      providerCooldownUntil !== undefined && providerCooldownUntil > now
        ? providerCooldownUntil
        : undefined;
    return {
      passiveEnabled,
      activeEnabled,
      frontendEngaged,
      queueSize: queue.length,
      inFlight: inFlight.size,
      analyzed,
      findingsCreated,
      invalidVerdicts,
      lastError,
      lastAnalysisAt,
      providerCooldownUntil: cooldown,
    };
  }

  function notifyStatus(): void {
    deps.onStatusChanged(snapshot());
  }

  function rateLimitCheck(host: string): { ok: true } | { ok: false; reason: string } {
    const now = Date.now();
    if (now - globalBucket.windowStart >= 60_000) {
      globalBucket = { windowStart: now, count: 0 };
    }
    if (globalBucket.count >= config.maxPerMinute) {
      return {
        ok: false,
        reason: `global rate limit ${String(config.maxPerMinute)}/min reached`,
      };
    }
    const bucket = hostBuckets.get(host);
    if (bucket === undefined || now - bucket.windowStart >= 60_000) {
      hostBuckets.set(host, { windowStart: now, count: 0 });
    }
    const currentBucket = hostBuckets.get(host);
    if (currentBucket !== undefined && currentBucket.count >= config.maxPerHostPerMinute) {
      return {
        ok: false,
        reason: `per-host rate limit ${String(config.maxPerHostPerMinute)}/min reached for ${host}`,
      };
    }
    return { ok: true };
  }

  function consumeRateBudget(host: string): void {
    globalBucket.count += 1;
    const bucket = hostBuckets.get(host);
    if (bucket !== undefined) bucket.count += 1;
  }

  function providerIsCoolingDown(): boolean {
    if (providerCooldownUntil === undefined) return false;
    if (Date.now() >= providerCooldownUntil) {
      providerCooldownUntil = undefined;
      return false;
    }
    return true;
  }

  function enqueue(job: QueueJob): { accepted: true } | { accepted: false; reason: string } {
    if (providerIsCoolingDown()) {
      const remainingMs =
        providerCooldownUntil !== undefined
          ? Math.max(0, providerCooldownUntil - Date.now())
          : 0;
      const remainingS = Math.ceil(remainingMs / 1000);
      return {
        accepted: false,
        reason: `Claude Code unavailable — retrying in ${String(remainingS)}s`,
      };
    }

    const rate = rateLimitCheck(job.host);
    if (!rate.ok) {
      return { accepted: false, reason: rate.reason };
    }

    if (queue.length + inFlight.size >= 64) {
      return { accepted: false, reason: "scanner queue saturated" };
    }

    consumeRateBudget(job.host);
    queue.push(job);
    notifyStatus();
    pump();
    return { accepted: true };
  }

  function pump(): void {
    while (inFlight.size < config.maxConcurrent && queue.length > 0) {
      if (providerIsCoolingDown()) break;
      const job = queue.shift();
      if (job === undefined) break;
      inFlight.add(job.jobId);
      notifyStatus();
      void runJob(job);
    }
  }

  async function runJob(job: QueueJob): Promise<void> {
    const ctx: JobContext = {
      jobId: job.jobId,
      emitFinding(finding) {
        findingsCreated += 1;
        recentFindings.unshift(finding);
        while (recentFindings.length > FINDING_BUFFER_CAP) recentFindings.pop();
        deps.onFinding(finding);
        notifyStatus();
      },
      reportError(message) {
        lastError = message;
        notifyStatus();
      },
      reportProviderMissing(message) {
        providerCooldownUntil = Date.now() + PROVIDER_COOLDOWN_MS;
        lastError = message;
        notifyStatus();
      },
      markAnalyzed() {
        analyzed += 1;
        lastAnalysisAt = Date.now();
        notifyStatus();
      },
    };
    try {
      await job.handler(ctx);
      if (job.kind === "active") {
        job.onResolve();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      if (job.kind === "active") {
        job.onReject(error instanceof Error ? error : new Error(message));
      }
    } finally {
      inFlight.delete(job.jobId);
      notifyStatus();
      pump();
    }
  }

  return {
    enqueue,
    getStatus: snapshot,
    setFlags(flags) {
      if (flags.passiveEnabled !== undefined) passiveEnabled = flags.passiveEnabled;
      if (flags.activeEnabled !== undefined) activeEnabled = flags.activeEnabled;
      if (flags.frontendEngaged !== undefined) frontendEngaged = flags.frontendEngaged;
      notifyStatus();
    },
    getRecentFindings() {
      return [...recentFindings];
    },
    clearRecentFindings() {
      recentFindings.length = 0;
      notifyStatus();
    },
    resetStats() {
      analyzed = 0;
      findingsCreated = 0;
      invalidVerdicts = 0;
      lastError = undefined;
      lastAnalysisAt = undefined;
      providerCooldownUntil = undefined;
      notifyStatus();
    },
    updateConfig(next) {
      config = next;
    },
    pump,
    recordInvalidVerdict(reason?: string) {
      invalidVerdicts += 1;
      if (reason !== undefined && reason !== "") {
        lastError = `invalid verdict: ${reason}`;
      }
      notifyStatus();
    },
  };
}
