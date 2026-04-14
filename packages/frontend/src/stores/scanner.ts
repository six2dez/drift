import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ActiveScanResult, ScannerRecentFinding, ScannerStatus } from "shared";
import { useSDK } from "../plugins/sdk";

const EMPTY_STATUS: ScannerStatus = {
  passiveEnabled: false,
  activeEnabled: false,
  frontendEngaged: false,
  queueSize: 0,
  inFlight: 0,
  analyzed: 0,
  findingsCreated: 0,
  invalidVerdicts: 0,
};

export const useScannerStore = defineStore("scanner", () => {
  const sdk = useSDK();
  const status = ref<ScannerStatus>({ ...EMPTY_STATUS });
  const recentFindings = ref<ScannerRecentFinding[]>([]);
  const lastActiveResult = ref<ActiveScanResult | undefined>(undefined);
  // Counter of active scans currently in flight OR waiting in the
  // serialization chain. `activeScanInFlight` is a computed boolean
  // derived from this — NOT from `hasInFlight`, because that one
  // also includes passive queue work and would flash the "active
  // scan in progress" spinner on every passive job.
  const activeScanPending = ref<number>(0);
  const activeScanInFlight = computed(() => activeScanPending.value > 0);
  // Serialization chain: every call to runActiveScan appends its RPC
  // onto this chain, so two context-menu clicks run sequentially
  // instead of racing. Errors inside a previous scan are swallowed
  // on the chain side (via `.catch`) so one failed scan cannot
  // poison all subsequent scans.
  let activeScanChain: Promise<unknown> = Promise.resolve();

  let keepAliveHandle: number | undefined;

  const hasInFlight = computed(() => status.value.inFlight > 0 || status.value.queueSize > 0);

  // Event subscriptions run once per app, at first `useScannerStore()`
  // call. Pinia stores live for the whole app lifetime, so there's
  // nothing to unsubscribe on teardown — and App.vue calling
  // `setScannerEngaged(false)` in onUnmounted covers the backend side.
  sdk.backend.onEvent("scanner-status", (event: ScannerStatus) => {
    status.value = event;
    if (hasInFlight.value) startKeepAlive();
    else stopKeepAliveIfIdle();
  });
  sdk.backend.onEvent("scanner-finding", (event: ScannerRecentFinding) => {
    recentFindings.value = [event, ...recentFindings.value].slice(0, 50);
  });

  async function refresh(): Promise<void> {
    const result = await sdk.backend.getScannerStatus().catch(() => undefined);
    if (result?.kind === "Ok") status.value = result.value;
    const recent = await sdk.backend.getScannerRecentFindings().catch(() => undefined);
    if (recent?.kind === "Ok") recentFindings.value = recent.value;
  }

  function startKeepAlive(): void {
    if (keepAliveHandle !== undefined) return;
    keepAliveHandle = setInterval(() => {
      void sdk.backend.getScannerStatus().then((result) => {
        if (result.kind === "Ok") {
          status.value = result.value;
          if (!hasInFlight.value) stopKeepAliveIfIdle();
        }
      }).catch(() => undefined);
    }, 1500) as unknown as number;
  }

  function stopKeepAliveIfIdle(): void {
    if (keepAliveHandle === undefined) return;
    if (hasInFlight.value) return;
    clearInterval(keepAliveHandle);
    keepAliveHandle = undefined;
  }

  async function setEngaged(engaged: boolean): Promise<void> {
    await sdk.backend.setScannerEngaged(engaged).catch(() => undefined);
  }

  function runActiveScan(requestId: string): Promise<ActiveScanResult | undefined> {
    activeScanPending.value += 1;
    // Chain onto the previous scan so the RPC for `requestId` does
    // not fire until every earlier scan has settled. The chain
    // swallows rejections on its own side (so next scans still run)
    // while the returned `next` promise still reflects this scan's
    // own result/throw to the caller.
    const next = activeScanChain.then(() => runActiveScanInternal(requestId));
    activeScanChain = next.catch(() => undefined);
    next
      .finally(() => {
        activeScanPending.value -= 1;
      })
      .catch(() => undefined);
    return next;
  }

  async function runActiveScanInternal(
    requestId: string,
  ): Promise<ActiveScanResult | undefined> {
    startKeepAlive();
    try {
      const result = await sdk.backend.runActiveScan({ requestId });
      if (result.kind === "Ok") {
        lastActiveResult.value = result.value;
        return result.value;
      }
      // Synthesize a result object so the UI still shows something
      // in the "Last active scan" card when the RPC itself errors.
      lastActiveResult.value = {
        jobId: `rpc-error-${Date.now()}`,
        payloadsSent: 0,
        confirmed: 0,
        findings: [],
        truncated: false,
        error: result.error,
      };
      return undefined;
    } catch (error) {
      lastActiveResult.value = {
        jobId: `rpc-throw-${Date.now()}`,
        payloadsSent: 0,
        confirmed: 0,
        findings: [],
        truncated: false,
        error: error instanceof Error ? error.message : String(error),
      };
      return undefined;
    } finally {
      stopKeepAliveIfIdle();
    }
  }

  async function clearRecentFindings(): Promise<void> {
    await sdk.backend.clearScannerRecentFindings().catch(() => undefined);
    recentFindings.value = [];
  }

  async function resetStats(): Promise<void> {
    await sdk.backend.resetScannerStats().catch(() => undefined);
  }

  return {
    status,
    recentFindings,
    lastActiveResult,
    activeScanInFlight,
    hasInFlight,
    refresh,
    setEngaged,
    runActiveScan,
    clearRecentFindings,
    resetStats,
  };
});
