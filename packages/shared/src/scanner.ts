// Shared types for the Drift scanner subsystem (passive + manual active).
// Kept free of runtime code so it can be imported from both the backend
// and the frontend Pinia store without dragging Node/DOM deps.

export type ScannerVulnerabilityClass =
  | "reflected-xss"
  | "error-sqli"
  | "lfi"
  | "ssti"
  | "open-redirect"
  | "other";

export const SCANNER_CONFIRMABLE_CLASSES: readonly ScannerVulnerabilityClass[] = [
  "reflected-xss",
  "error-sqli",
  "lfi",
  "ssti",
  "open-redirect",
] as const;

export type ScannerSeverity = "info" | "low" | "medium" | "high" | "critical";

export type ScannerConfidence = "low" | "medium" | "high";

export type ScannerSettings = {
  passiveEnabled: boolean;
  activeEnabled: boolean;
  maxConcurrent: number;
  maxPerMinute: number;
  maxPerHostPerMinute: number;
  maxBodyBytes: number;
  skipStaticAssets: boolean;
  scopeOnly: boolean;
  maxActivePayloads: number;
  jobTimeoutSeconds: number;
  redactionEnabled: boolean;
  confidenceThreshold: "medium" | "high";
};

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  passiveEnabled: false,
  activeEnabled: false,
  maxConcurrent: 1,
  maxPerMinute: 20,
  maxPerHostPerMinute: 5,
  maxBodyBytes: 65536,
  skipStaticAssets: true,
  scopeOnly: true,
  maxActivePayloads: 8,
  jobTimeoutSeconds: 120,
  redactionEnabled: true,
  confidenceThreshold: "medium",
};

// Legacy field names we still accept in persisted settings and rewrite
// to the current shape on load. This helper is called by both the
// backend `loadJson<Settings>` callback and the frontend's
// `sdk.storage.get()` bootstrap, so the normalization logic lives in
// exactly one place.
export function migrateScannerSettings(raw: unknown): ScannerSettings {
  if (raw === undefined || raw === null || typeof raw !== "object") {
    return { ...DEFAULT_SCANNER_SETTINGS };
  }
  const source = raw as Record<string, unknown>;
  const merged: ScannerSettings = { ...DEFAULT_SCANNER_SETTINGS };
  for (const key of Object.keys(DEFAULT_SCANNER_SETTINGS) as Array<keyof ScannerSettings>) {
    if (key in source) {
      const value = source[key];
      if (value !== undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
  // Field rename: activeTimeoutSeconds → jobTimeoutSeconds.
  if (!("jobTimeoutSeconds" in source) && typeof source["activeTimeoutSeconds"] === "number") {
    merged.jobTimeoutSeconds = source["activeTimeoutSeconds"] as number;
  }
  // Dropped field `providerId` is intentionally not copied. Any stale
  // `providerId` in persisted settings is silently discarded here.
  return merged;
}

export type ScannerStatus = {
  passiveEnabled: boolean;
  activeEnabled: boolean;
  frontendEngaged: boolean;
  queueSize: number;
  inFlight: number;
  analyzed: number;
  findingsCreated: number;
  invalidVerdicts: number;
  lastError?: string;
  lastAnalysisAt?: number;
  providerCooldownUntil?: number;
};

export type ScannerRecentFinding = {
  id: string;
  jobId: string;
  occurredAt: number;
  kind: "passive" | "active";
  title: string;
  severity: ScannerSeverity;
  className: ScannerVulnerabilityClass;
  url: string;
  requestId?: string;
  dedupeKey: string;
  evidence: string;
  description: string;
  createdInCaido: boolean;
};

export type ScannerPendingActiveScan = {
  requestId: string;
  source: "request" | "request-row";
};

export type ActiveScanResult = {
  jobId: string;
  payloadsSent: number;
  confirmed: number;
  findings: ScannerRecentFinding[];
  truncated: boolean;
  error?: string;
};

export type ScannerInjectionPointKind = "query" | "body" | "header";

export type ScannerInjectionPoint = {
  kind: ScannerInjectionPointKind;
  name: string;
};
