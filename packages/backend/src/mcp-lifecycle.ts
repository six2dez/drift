// Pure coordination state for the MCP runtime lifecycle. `index.ts` owns every
// I/O effect; this module owns the identities that decide whether an effect is
// still allowed after an await. Keeping the state here makes the delayed-cleanup
// and delayed-child-release interleavings executable under Vitest even though
// the Caido orchestrator itself cannot be imported there (T-08-27/T-08-28).

export type DirectMcpCallToken = Readonly<{
  epoch: number;
  id: number;
}>;

export type ProviderStartLease = Readonly<{
  epoch: number;
  id: number;
  tempDir: string | undefined;
}>;

type ProviderTeardownToken = Readonly<{ id: number }>;

export type McpLifecycleState = {
  currentEpoch: number;
  nextDirectCallId: number;
  directCalls: Set<DirectMcpCallToken>;
  nextProviderStartId: number;
  providerStarts: Set<ProviderStartLease>;
  retiredProviderStarts: Set<ProviderStartLease>;
  nextProviderTeardownId: number;
  activeProviderTeardown: ProviderTeardownToken | undefined;
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
    nextProviderStartId: 1,
    providerStarts: new Set(),
    retiredProviderStarts: new Set(),
    nextProviderTeardownId: 1,
    activeProviderTeardown: undefined,
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

export type McpStartDisposition = "start" | "reuse" | "replace";

export function getMcpStartDisposition(input: {
  tempDir: string | undefined;
  authValid: boolean;
  tokenAvailable: boolean;
  runtimeDirectoryPresent: boolean;
  runtimeScriptPresent: boolean;
  runtimeContextPresent: boolean;
}): McpStartDisposition {
  if (input.tempDir === undefined) return "start";
  return input.authValid &&
    input.tokenAvailable &&
    input.runtimeDirectoryPresent &&
    input.runtimeScriptPresent &&
    input.runtimeContextPresent
    ? "reuse"
    : "replace";
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

// A provider turn is deliberately NOT put on the lifecycle FIFO: doing that
// would hold Stop behind the entire turn. The lease covers preparation only.
// Its commit callback is synchronous, so checking the generation and adding the
// spawned handle to `activeProcesses` form one event-loop turn with no teardown
// interleaving between them.
export function acquireProviderStartLease(
  state: McpLifecycleState,
  tempDir: string | undefined,
): ProviderStartLease | undefined {
  if (state.activeProviderTeardown !== undefined) return undefined;
  const lease: ProviderStartLease = {
    epoch: state.currentEpoch,
    id: state.nextProviderStartId,
    tempDir,
  };
  state.nextProviderStartId += 1;
  state.providerStarts.add(lease);
  return lease;
}

export function releaseProviderStartLease(
  state: McpLifecycleState,
  lease: ProviderStartLease,
): boolean {
  // The teardown tombstone is consumed by exact lease identity. An equal path
  // or equal-looking lease cannot authorize wrong-generation cleanup
  // (T-08-90), and a stale sender can act on its own retirement only once.
  const retired = state.retiredProviderStarts.delete(lease);
  state.providerStarts.delete(lease);
  return retired;
}

export async function cleanupRetiredProviderStartRoot(input: {
  retired: boolean;
  tempDir: string | undefined;
  removeRoot: (tempDir: string) => Promise<void>;
}): Promise<void> {
  // Retirement is decided by lifecycle identity before this I/O boundary. A
  // stale sender must remove any token-bearing root it recreated (T-08-89),
  // even when an installed pointer happens to contain the same pathname.
  if (!input.retired || input.tempDir === undefined) return;
  await input.removeRoot(input.tempDir);
}

export function commitProviderStartLease<T>(input: {
  state: McpLifecycleState;
  lease: ProviderStartLease;
  currentTempDir: string | undefined;
  commit: () => T;
}): { kind: "committed"; value: T } | { kind: "stale" } {
  const current =
    input.state.activeProviderTeardown === undefined &&
    input.state.providerStarts.has(input.lease) &&
    input.state.currentEpoch === input.lease.epoch &&
    input.currentTempDir === input.lease.tempDir;
  input.state.providerStarts.delete(input.lease);
  if (!current) return { kind: "stale" };
  return { kind: "committed", value: input.commit() };
}

// Invalidate pending provider starts BEFORE teardown performs its one process
// pass. A start already committed is present in `activeProcesses` and is killed
// by that pass; a paused start loses its lease and its later commit is refused.
// The blocker lasts only for the teardown operation and is restored correctly
// for a defensive nested call.
export async function runMcpProviderTeardown<T>(
  state: McpLifecycleState,
  operation: () => Promise<T>,
): Promise<T> {
  const previousTeardown = state.activeProviderTeardown;
  const token: ProviderTeardownToken = { id: state.nextProviderTeardownId };
  state.nextProviderTeardownId += 1;
  state.activeProviderTeardown = token;
  for (const lease of state.providerStarts) {
    state.retiredProviderStarts.add(lease);
  }
  state.providerStarts.clear();
  try {
    return await operation();
  } finally {
    if (state.activeProviderTeardown === token) {
      state.activeProviderTeardown = previousTeardown;
    }
  }
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
