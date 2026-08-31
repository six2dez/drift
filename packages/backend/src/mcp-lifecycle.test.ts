import { describe, expect, it } from "vitest";

import {
  acquireMcpDirectCall,
  beginMcpRuntimeGeneration,
  countMcpDirectCalls,
  createMcpLifecycleState,
  getMcpRuntimeEpoch,
  isMcpOrphanReapGateCurrent,
  isMcpRuntimeEpochCurrent,
  releaseMcpDirectCall,
  retireMcpDirectCalls,
  runMcpLifecycleOperation,
} from "./mcp-lifecycle";

describe("MCP lifecycle generations", () => {
  it("prevents a late old-generation release from consuming a new call", () => {
    const state = createMcpLifecycleState();
    const oldEpoch = beginMcpRuntimeGeneration(state);
    const oldToken = acquireMcpDirectCall(state);

    retireMcpDirectCalls(state, oldEpoch);
    const newEpoch = beginMcpRuntimeGeneration(state);
    const newToken = acquireMcpDirectCall(state);

    releaseMcpDirectCall(state, oldToken);
    expect(countMcpDirectCalls(state, newEpoch)).toBe(1);

    releaseMcpDirectCall(state, newToken);
    expect(countMcpDirectCalls(state, newEpoch)).toBe(0);
  });

  it("makes a delayed cleanup epoch stale after a replacement generation starts", () => {
    const state = createMcpLifecycleState();
    const cleanupEpoch = beginMcpRuntimeGeneration(state);
    expect(isMcpRuntimeEpochCurrent(state, cleanupEpoch)).toBe(true);

    const replacementEpoch = beginMcpRuntimeGeneration(state);
    expect(getMcpRuntimeEpoch(state)).toBe(replacementEpoch);
    expect(isMcpRuntimeEpochCurrent(state, cleanupEpoch)).toBe(false);
  });
});

describe("orphan reap generation gates", () => {
  it("turns a delayed session scan into a no-op after a replacement session registers", () => {
    const state = createMcpLifecycleState();
    const epoch = beginMcpRuntimeGeneration(state);
    const gate = {
      kind: "session-idle" as const,
      epoch,
      tempDir: "/tmp/drift-mcp-deadbeef",
    };
    let signalAttempts = 0;

    // This closure is the scanner's controllable delayed `close` callback. A
    // new turn has registered by the time it is released (`sessionIdle=false`).
    const settleDelayedScan = (): void => {
      if (
        isMcpOrphanReapGateCurrent({
          state,
          gate,
          currentTempDir: gate.tempDir,
          sessionIdle: false,
        })
      ) {
        signalAttempts += 1;
      }
    };

    settleDelayedScan();
    expect(signalAttempts).toBe(0);
  });

  it("invalidates a previous-run scan as soon as startup stages a runtime", () => {
    const state = createMcpLifecycleState();
    const gate = {
      kind: "runtime-absent" as const,
      epoch: beginMcpRuntimeGeneration(state),
    };

    expect(
      isMcpOrphanReapGateCurrent({
        state,
        gate,
        currentTempDir: "/tmp/drift-mcp-newruntime",
        sessionIdle: true,
      }),
    ).toBe(false);
  });

  it("allows cleanup to settle after clearing its dir but not after replacement", () => {
    const state = createMcpLifecycleState();
    const cleanupEpoch = beginMcpRuntimeGeneration(state);
    const gate = {
      kind: "runtime-cleanup" as const,
      epoch: cleanupEpoch,
      tempDir: "/tmp/drift-mcp-oldruntime",
    };

    expect(
      isMcpOrphanReapGateCurrent({
        state,
        gate,
        currentTempDir: undefined,
        sessionIdle: true,
      }),
    ).toBe(true);

    beginMcpRuntimeGeneration(state);
    expect(
      isMcpOrphanReapGateCurrent({
        state,
        gate,
        currentTempDir: "/tmp/drift-mcp-newruntime",
        sessionIdle: true,
      }),
    ).toBe(false);
  });
});

describe("MCP lifecycle operation queue", () => {
  it("does not start a replacement operation until delayed cleanup settles", async () => {
    const state = createMcpLifecycleState();
    const events: string[] = [];
    let releaseCleanup: () => void = () => undefined;
    const cleanupCanFinish = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });

    const cleanup = runMcpLifecycleOperation(state, async () => {
      events.push("cleanup-start");
      await cleanupCanFinish;
      events.push("cleanup-end");
    });
    const replacement = runMcpLifecycleOperation(state, async () => {
      events.push("replacement-start");
    });

    await Promise.resolve();
    expect(events).toEqual(["cleanup-start"]);

    releaseCleanup();
    await Promise.all([cleanup, replacement]);
    expect(events).toEqual([
      "cleanup-start",
      "cleanup-end",
      "replacement-start",
    ]);
  });

  it("continues after a rejected operation instead of poisoning the queue", async () => {
    const state = createMcpLifecycleState();
    const failed = runMcpLifecycleOperation(state, async () => {
      throw new Error("expected failure");
    });
    const afterFailure = runMcpLifecycleOperation(state, async () => "ran");

    await expect(failed).rejects.toThrow("expected failure");
    await expect(afterFailure).resolves.toBe("ran");
  });
});
