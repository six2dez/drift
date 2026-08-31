// Pure coordination state for the MCP runtime lifecycle. `index.ts` owns every
// I/O effect; this module owns the identities that decide whether an effect is
// still allowed after an await. Keeping the state here makes the delayed-cleanup
// and delayed-child-release interleavings executable under Vitest even though
// the Caido orchestrator itself cannot be imported there (T-08-27/T-08-28).

export type DirectMcpCallToken = Readonly<{
  epoch: number;
  id: number;
}>;

export type McpLifecycleState = {
  currentEpoch: number;
  nextDirectCallId: number;
  directCalls: Set<DirectMcpCallToken>;
  operationTail: Promise<void>;
};

export type McpOrphanReapGate =
  | { kind: "session-idle"; epoch: number; tempDir: string | undefined }
  | { kind: "runtime-absent"; epoch: number }
  | {
      kind: "runtime-cleanup";
      epoch: number;
      tempDir: string | undefined;
    };

export function createMcpLifecycleState(): McpLifecycleState {
  return {
    currentEpoch: 0,
    nextDirectCallId: 1,
    directCalls: new Set(),
    operationTail: Promise.resolve(),
  };
}

export function beginMcpRuntimeGeneration(state: McpLifecycleState): number {
  state.currentEpoch += 1;
  return state.currentEpoch;
}

export function getMcpRuntimeEpoch(state: McpLifecycleState): number {
  return state.currentEpoch;
}

export function isMcpRuntimeEpochCurrent(
  state: McpLifecycleState,
  epoch: number,
): boolean {
  return state.currentEpoch === epoch;
}

export function isMcpOrphanReapGateCurrent(input: {
  state: McpLifecycleState;
  gate: McpOrphanReapGate;
  currentTempDir: string | undefined;
  sessionIdle: boolean;
}): boolean {
  if (!isMcpRuntimeEpochCurrent(input.state, input.gate.epoch)) return false;

  if (input.gate.kind === "runtime-absent") {
    return input.currentTempDir === undefined;
  }

  if (input.gate.kind === "runtime-cleanup") {
    // Cleanup may clear its captured directory before the scanner's close event
    // is delivered. That remains the same retired generation. A replacement
    // start increments the epoch, so it is rejected above (T-08-27).
    return (
      input.currentTempDir === input.gate.tempDir ||
      input.currentTempDir === undefined
    );
  }

  return (
    input.currentTempDir === input.gate.tempDir && input.sessionIdle
  );
}

export function acquireMcpDirectCall(
  state: McpLifecycleState,
): DirectMcpCallToken {
  const token: DirectMcpCallToken = {
    epoch: state.currentEpoch,
    id: state.nextDirectCallId,
  };
  state.nextDirectCallId += 1;
  state.directCalls.add(token);
  return token;
}

export function releaseMcpDirectCall(
  state: McpLifecycleState,
  token: DirectMcpCallToken,
): void {
  // Object identity is intentional. A late release can delete only the exact
  // token its acquire returned; an equal-looking token from a new generation is
  // not affected.
  state.directCalls.delete(token);
}

export function retireMcpDirectCalls(
  state: McpLifecycleState,
  epoch: number,
): void {
  for (const token of state.directCalls) {
    if (token.epoch === epoch) state.directCalls.delete(token);
  }
}

export function countMcpDirectCalls(
  state: McpLifecycleState,
  epoch: number = state.currentEpoch,
): number {
  let count = 0;
  for (const token of state.directCalls) {
    if (token.epoch === epoch) count += 1;
  }
  return count;
}

// One FIFO for start, stop and refresh. The tail is a barrier that always
// resolves in `finally`; an operation failure is returned to its own caller and
// cannot poison later operations. No mutex primitive or timer is required, so
// this remains compatible with the constrained backend runtime.
export async function runMcpLifecycleOperation<T>(
  state: McpLifecycleState,
  operation: () => Promise<T>,
): Promise<T> {
  const predecessor = state.operationTail;
  let releaseBarrier: () => void = () => undefined;
  state.operationTail = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  await predecessor;
  try {
    return await operation();
  } finally {
    releaseBarrier();
  }
}
