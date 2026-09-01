import { EventEmitter } from "node:events";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

type SpawnImplementation = (
  file: string,
  args?: readonly string[],
  options?: Record<string, unknown>,
) => ControlledChild;

type RmImplementation = (
  target: string,
  options?: { force?: boolean; recursive?: boolean },
) => Promise<void>;

type ReaddirImplementation = (
  target: string,
  options?: unknown,
) => Promise<unknown[]>;

const boundary = vi.hoisted(() => ({
  tempRoot: "",
  spawn: undefined as SpawnImplementation | undefined,
  rm: undefined as RmImplementation | undefined,
  readdir: undefined as ReaddirImplementation | undefined,
}));

vi.mock("os", () => {
  const platform = () => "darwin";
  const tmpdir = () => boundary.tempRoot;
  const release = () => "completion-order-harness";
  return {
    default: { platform, tmpdir, release },
    platform,
    tmpdir,
    release,
  };
});

vi.mock("child_process", () => ({
  spawn: (
    file: string,
    args?: readonly string[],
    options?: Record<string, unknown>,
  ) => {
    if (boundary.spawn === undefined) {
      throw new Error("completion-order harness spawn boundary was not armed");
    }
    return boundary.spawn(file, args, options);
  },
}));

vi.mock("fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  return {
    ...actual,
    rm: (
      target: string,
      options?: { force?: boolean; recursive?: boolean },
    ) => {
      if (boundary.rm === undefined) {
        throw new Error("completion-order harness rm boundary was not armed");
      }
      return boundary.rm(target, options);
    },
    readdir: (target: string, options?: unknown) => {
      if (boundary.readdir === undefined) {
        throw new Error("completion-order harness readdir boundary was not armed");
      }
      return boundary.readdir(target, options);
    },
  };
});

class ControlledChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid: number;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  private completed = false;
  private readonly onKill?: (signal: NodeJS.Signals | number | undefined) => void;

  constructor(
    pid: number,
    onKill?: (signal: NodeJS.Signals | number | undefined) => void,
  ) {
    super();
    this.pid = pid;
    this.onKill = onKill;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.onKill?.(signal);
    return true;
  }

  complete(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.completed) return;
    this.completed = true;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
    this.emit("close", code, signal);
    this.stdout.end();
    this.stderr.end();
  }
}

type ApiHandler = (...args: unknown[]) => unknown;

type RemovalObservation = {
  event: "token_root_remove_started";
  directSignalIssued: boolean;
  providerExitComplete: boolean;
  treeKillSpawned: boolean;
  treeKillComplete: boolean;
  reapScanSpawned: boolean;
  reapScanComplete: boolean;
  requirementSatisfied: boolean;
};

async function waitUntil(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}`);
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function settleSoon(
  child: ControlledChild,
  input: { code: number; stdout?: string; stderr?: string },
): ControlledChild {
  queueMicrotask(() => {
    if (input.stdout !== undefined) child.stdout.write(input.stdout);
    if (input.stderr !== undefined) child.stderr.write(input.stderr);
    child.complete(input.code);
  });
  return child;
}

describe("Phase 8 SC-4 completion-order evidence", () => {
  it("waits for kill and reap completion before recursive token-root removal", async () => {
    const realFs = await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
    const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
    const fixtureRoot = await realFs.mkdtemp(
      path.join(boundary.tempRoot || "/tmp", "drift-completion-harness-"),
    );
    const tempRoot = path.join(fixtureRoot, "temp");
    const pluginDir = path.join(fixtureRoot, "plugin");
    const assetsDir = path.join(fixtureRoot, "assets");
    const providerPath = path.join(fixtureRoot, "synthetic-provider");
    await Promise.all([
      realFs.mkdir(tempRoot, { recursive: true }),
      realFs.mkdir(pluginDir, { recursive: true }),
      realFs.mkdir(assetsDir, { recursive: true }),
    ]);
    await realFs.copyFile(
      path.join(repoRoot, "packages/backend/assets/mcp-server.mjs"),
      path.join(assetsDir, "mcp-server.mjs"),
    );
    await realFs.writeFile(providerPath, "synthetic provider fixture\n", {
      mode: 0o700,
    });
    boundary.tempRoot = tempRoot;

    let nextPid = 41_000;
    let startupPgrepCount = 0;
    let armTeardownSchedule = false;
    let directSignalIssued = false;
    let providerExitComplete = false;
    let treeKillSpawned = false;
    let treeKillComplete = false;
    let reapScanSpawned = false;
    let reapScanComplete = false;
    let provider: ControlledChild | undefined;
    let teardownScanner: ControlledChild | undefined;
    const treeKillers: ControlledChild[] = [];
    const removals: RemovalObservation[] = [];

    const newChild = (
      onKill?: (signal: NodeJS.Signals | number | undefined) => void,
    ) => new ControlledChild(nextPid++, onKill);

    boundary.readdir = async (target, options) => {
      const resolved = path.resolve(String(target));
      if (resolved !== path.resolve(tempRoot)) return [];
      return (await realFs.readdir(target, options as never)) as unknown[];
    };

    boundary.rm = async (target, options) => {
      const resolved = path.resolve(String(target));
      const isRuntimeRoot =
        path.basename(resolved).startsWith("drift-mcp-") &&
        options?.recursive === true;
      if (isRuntimeRoot && !resolved.startsWith(`${path.resolve(tempRoot)}${path.sep}`)) {
        throw new Error("Harness refused recursive removal outside its isolated temp root");
      }
      if (isRuntimeRoot && armTeardownSchedule) {
        const observation: RemovalObservation = {
          event: "token_root_remove_started",
          directSignalIssued,
          providerExitComplete,
          treeKillSpawned,
          treeKillComplete,
          reapScanSpawned,
          reapScanComplete,
          requirementSatisfied:
            providerExitComplete && treeKillComplete && reapScanComplete,
        };
        removals.push(observation);
      }
      await realFs.rm(target, options);
    };

    boundary.spawn = (file, args = []) => {
      const executable = path.basename(String(file));
      if (executable === "pgrep") {
        const scanner = newChild();
        if (armTeardownSchedule) {
          reapScanSpawned = true;
          teardownScanner = scanner;
          scanner.once("close", () => {
            reapScanComplete = true;
          });
          return scanner;
        }
        startupPgrepCount += 1;
        return settleSoon(scanner, { code: 1 });
      }

      if (executable === "kill") {
        treeKillSpawned = true;
        const killer = newChild();
        killer.once("close", () => {
          treeKillComplete = true;
        });
        treeKillers.push(killer);
        return killer;
      }

      if (String(file) === providerPath) {
        provider = newChild(() => {
          directSignalIssued = true;
        });
        provider.once("exit", () => {
          providerExitComplete = true;
        });
        return provider;
      }

      if (args.includes("--validate-auth")) {
        return settleSoon(newChild(), {
          code: 0,
          stdout: '{"ok":true}\n',
        });
      }

      if (args.includes("--version")) {
        return settleSoon(newChild(), { code: 0, stdout: "v20.0.0\n" });
      }

      if (executable === "which") {
        return settleSoon(newChild(), {
          code: 0,
          stdout: `${process.execPath}\n`,
        });
      }

      throw new Error(`Unexpected synthetic spawn boundary: ${executable}`);
    };

    const handlers = new Map<string, ApiHandler>();
    const eventPayloads: unknown[] = [];
    const sdk = {
      meta: {
        path: () => pluginDir,
        assetsPath: () => assetsDir,
        db: () => undefined,
      },
      api: {
        register: (name: string, handler: ApiHandler) => {
          handlers.set(name, (...args: unknown[]) => handler(sdk, ...args));
        },
        send: (_name: string, payload: unknown) => {
          eventPayloads.push(payload);
        },
      },
      console: {
        log: (_message: string) => undefined,
        error: (_message: string) => undefined,
      },
      projects: {
        getCurrent: async () => null,
      },
      events: {
        onProjectChange: (_handler: ApiHandler) => undefined,
      },
    };

    const call = async <T>(name: string, ...args: unknown[]): Promise<T> => {
      const handler = handlers.get(name);
      if (handler === undefined) throw new Error(`Missing registered API ${name}`);
      return (await handler(...args)) as T;
    };

    let sendPromise: Promise<{ kind: string }> | undefined;
    let observation: RemovalObservation | undefined;
    let stopResult: { kind: string } | undefined;

    try {
      const { init } = await import("../../../packages/backend/src/index");
      init(sdk as never);

      const settingsResult = await call<{ kind: string }>("updateSettings", {
        providers: {
          "claude-cli": { command: providerPath, enabled: true },
          "gemini-cli": { command: "gemini", enabled: false },
          "codex-cli": { command: "codex", enabled: false },
          "copilot-cli": { command: "copilot", enabled: false },
        },
        activeProvider: "claude-cli",
        processTimeoutSeconds: 30,
        debugLogging: false,
      });
      expect(settingsResult.kind).toBe("Ok");

      const tokenResult = await call<{ kind: string }>(
        "syncCaidoSessionToken",
        "synthetic-token-not-a-secret",
      );
      expect(tokenResult.kind).toBe("Ok");

      const startResult = await call<{ kind: string }>("startMcpServer");
      expect(startResult.kind).toBe("Ok");

      const sessionResult = await call<{
        kind: string;
        value?: string;
      }>("createCliSession", {
        providerId: "claude-cli",
        chatId: "completion-order-chat",
      });
      expect(sessionResult.kind).toBe("Ok");
      expect(sessionResult.value).toBeTypeOf("string");

      sendPromise = call<{ kind: string }>("sendCliMessage", {
        sessionId: sessionResult.value,
        chatId: "completion-order-chat",
        text: "hold this synthetic provider turn open",
      });
      await waitUntil(() => provider !== undefined, "the tracked provider spawn");

      armTeardownSchedule = true;
      stopResult = await call<{ kind: string }>("stopMcpServer");
      // Stop must yield without awaiting Caido-starvable child callbacks. Once
      // it has yielded, release the controlled host completions and require the
      // deferred production barrier to reach recursive removal on its own.
      provider?.complete(null, "SIGKILL");
      for (const killer of treeKillers) killer.complete(0);
      teardownScanner?.complete(1);
      await waitUntil(
        () => removals.length === 1,
        "deferred cleanup after every controlled completion",
      );
      observation = removals[0];
    } finally {
      provider?.complete(null, "SIGKILL");
      for (const killer of treeKillers) killer.complete(0);
      teardownScanner?.complete(1);
      if (sendPromise !== undefined) await sendPromise;
      boundary.spawn = undefined;
      boundary.rm = undefined;
      boundary.readdir = undefined;
      await realFs.rm(fixtureRoot, { recursive: true, force: true });
    }

    expect(stopResult?.kind).toBe("Ok");
    expect(startupPgrepCount).toBeGreaterThanOrEqual(1);
    expect(eventPayloads.length).toBeGreaterThan(0);
    expect(removals).toHaveLength(1);
    expect(observation).toBeDefined();
    expect(observation?.directSignalIssued).toBe(true);
    expect(observation?.treeKillSpawned).toBe(true);
    expect(observation?.reapScanSpawned).toBe(true);

    console.log(
      `DRIFT_COMPLETION_ORDER_OBSERVATION=${JSON.stringify(observation)}`,
    );

    expect(observation?.requirementSatisfied).toBe(true);
  });
});
