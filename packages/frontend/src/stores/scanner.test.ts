import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { ActiveScanResult } from "shared";

// Each call to runActiveScan returns a deferred promise so each test
// can decide when that particular scan resolves — this is what lets
// us assert "scan B's RPC does not fire until scan A resolves".
type Deferred = {
  promise: Promise<{ kind: "Ok"; value: ActiveScanResult }>;
  resolve: (value: ActiveScanResult) => void;
};

function makeDeferred(): Deferred {
  let resolve: (value: ActiveScanResult) => void = () => undefined;
  const promise = new Promise<{ kind: "Ok"; value: ActiveScanResult }>(
    (res) => {
      resolve = (value) => res({ kind: "Ok", value });
    },
  );
  return { promise, resolve };
}

const pendingDeferreds: Deferred[] = [];
const runActiveScanMock = vi.fn((_input: { requestId: string }) => {
  const deferred = makeDeferred();
  pendingDeferreds.push(deferred);
  return deferred.promise;
});

const mockSdk = {
  backend: {
    runActiveScan: runActiveScanMock,
    onEvent: vi.fn(),
    getScannerStatus: vi.fn(() => Promise.resolve({ kind: "Ok", value: {} })),
    getScannerRecentFindings: vi.fn(() =>
      Promise.resolve({ kind: "Ok", value: [] }),
    ),
    setScannerEngaged: vi.fn(() => Promise.resolve({ kind: "Ok", value: undefined })),
    clearScannerRecentFindings: vi.fn(() =>
      Promise.resolve({ kind: "Ok", value: undefined }),
    ),
    resetScannerStats: vi.fn(() =>
      Promise.resolve({ kind: "Ok", value: undefined }),
    ),
  },
};

vi.mock("../plugins/sdk", () => ({
  useSDK: () => mockSdk,
}));

import { useScannerStore } from "./scanner";

function buildResult(jobId: string, confirmed: number): ActiveScanResult {
  return {
    jobId,
    payloadsSent: confirmed,
    confirmed,
    findings: [],
    truncated: false,
  };
}

describe("scanner store — active scan serialization", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pendingDeferreds.length = 0;
    runActiveScanMock.mockClear();
  });

  it("serializes back-to-back runActiveScan calls instead of racing them", async () => {
    const store = useScannerStore();

    // Fire three scans synchronously. If the store were not
    // serializing, all three RPCs would be observed in the mock
    // immediately.
    const promiseA = store.runActiveScan("req-A");
    const promiseB = store.runActiveScan("req-B");
    const promiseC = store.runActiveScan("req-C");

    // Flush the initial microtasks so the first chain step runs. Only
    // the FIRST RPC should be in flight at this point.
    await Promise.resolve();
    await Promise.resolve();

    expect(runActiveScanMock).toHaveBeenCalledTimes(1);
    expect(runActiveScanMock).toHaveBeenLastCalledWith({ requestId: "req-A" });
    expect(store.activeScanInFlight).toBe(true);

    // Resolve A. B should now be allowed to fire, but C must still
    // wait until B settles.
    pendingDeferreds[0]?.resolve(buildResult("job-A", 1));
    await promiseA;

    expect(runActiveScanMock).toHaveBeenCalledTimes(2);
    expect(runActiveScanMock).toHaveBeenLastCalledWith({ requestId: "req-B" });
    expect(store.activeScanInFlight).toBe(true);

    // Resolve B. C should now fire.
    pendingDeferreds[1]?.resolve(buildResult("job-B", 0));
    await promiseB;

    expect(runActiveScanMock).toHaveBeenCalledTimes(3);
    expect(runActiveScanMock).toHaveBeenLastCalledWith({ requestId: "req-C" });
    expect(store.activeScanInFlight).toBe(true);

    // Resolve C. Everything settles, spinner goes off.
    pendingDeferreds[2]?.resolve(buildResult("job-C", 2));
    await promiseC;
    // Let the trailing .finally decrement the counter before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(store.activeScanInFlight).toBe(false);
    // The most recently settled scan is the one reflected in the UI
    // card — sequentially, C resolved last.
    expect(store.lastActiveResult?.jobId).toBe("job-C");
  });

  it("keeps the chain alive after a failed scan so subsequent scans still run", async () => {
    const store = useScannerStore();

    // First scan: backend resolves with an Error result. The store
    // should not reject — it synthesizes a placeholder — but the
    // serialization chain must still drain the second call.
    runActiveScanMock.mockImplementationOnce((_input: { requestId: string }) =>
      Promise.resolve({ kind: "Error", error: "backend blew up" }),
    );

    const promiseA = store.runActiveScan("req-A");
    const promiseB = store.runActiveScan("req-B");

    await promiseA;

    expect(runActiveScanMock).toHaveBeenCalledTimes(2);
    expect(runActiveScanMock).toHaveBeenLastCalledWith({ requestId: "req-B" });
    expect(store.lastActiveResult?.error).toBe("backend blew up");

    pendingDeferreds[0]?.resolve(buildResult("job-B", 0));
    await promiseB;
    await Promise.resolve();
    await Promise.resolve();

    expect(store.activeScanInFlight).toBe(false);
    expect(store.lastActiveResult?.jobId).toBe("job-B");
  });
});
