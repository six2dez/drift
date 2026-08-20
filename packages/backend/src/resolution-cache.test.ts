import { describe, expect, it, vi } from "vitest";
import {
  RESOLUTION_NEGATIVE_TTL_MS,
  RESOLUTION_POSITIVE_TTL_MS,
  buildProviderCommandSignature,
  clearResolutionCache,
  createResolutionCacheState,
  describeResolutionCache,
  resolveWithCache,
  syncResolutionCacheSignature,
  writeResolutionCache,
} from "./resolution-cache";

// Time is driven ENTIRELY through the `now` parameter. There is deliberately no
// timer mocking anywhere in this file: the injected clock is the design, and it
// is also what makes the expiry case a real gate. "expires" primes an entry at
// now = 0 and re-reads at now = RESOLUTION_POSITIVE_TTL_MS + 1 while real
// elapsed time is under a millisecond, so an implementation that read a wall
// clock would keep the entry live and call the resolver once instead of twice.

describe("resolveWithCache", () => {
  it("serves a positive result from cache within TTL without calling the resolver", async () => {
    const state = createResolutionCacheState();
    const resolve = vi.fn(async () => "/usr/bin/node");

    const first = await resolveWithCache(state, {
      key: "node",
      now: 0,
      resolve,
    });
    const second = await resolveWithCache(state, {
      key: "node",
      now: RESOLUTION_POSITIVE_TTL_MS - 1,
      resolve,
    });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(first).toBe("/usr/bin/node");
    expect(second).toBe("/usr/bin/node");
  });

  it("collapses concurrent callers for one key onto a single in-flight resolve", async () => {
    // PERF-03's stated aim is "collapsing the repeated walk across a burst of
    // turns", and a burst is concurrent by definition. Without in-flight
    // sharing, getDiagnostics running while startMcpServer resolves Node
    // performs the readdir + stat + `node --version` walk twice.
    const state = createResolutionCacheState();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const resolve = vi.fn(async () => {
      await gate;
      return "/usr/bin/node";
    });

    const first = resolveWithCache(state, { key: "node", now: 0, resolve });
    const second = resolveWithCache(state, { key: "node", now: 0, resolve });
    const other = resolveWithCache(state, {
      key: "claude",
      now: 0,
      resolve,
    });
    release?.();

    expect(await first).toBe("/usr/bin/node");
    expect(await second).toBe("/usr/bin/node");
    expect(await other).toBe("/usr/bin/node");
    // Twice, not three times: the two "node" callers share one walk, and the
    // different key is not collapsed into it.
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("does not join an in-flight resolve when the caller asked to bypass", async () => {
    // The bypass exists so the user's manual "Check" button gets a genuinely
    // fresh answer. Joining a walk that started before they installed the CLI
    // would hand back exactly the stale answer they pressed the button to
    // escape.
    const state = createResolutionCacheState();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const resolve = vi.fn(async () => {
      await gate;
      return "/usr/bin/node";
    });

    const pending = resolveWithCache(state, { key: "node", now: 0, resolve });
    const bypassed = resolveWithCache(state, {
      key: "node",
      now: 0,
      bypass: true,
      resolve,
    });
    release?.();

    await pending;
    await bypassed;
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("releases the in-flight slot when the resolver rejects", async () => {
    // A rejected promise left in the map would pin every later caller to that
    // same failure for the life of the process.
    const state = createResolutionCacheState();
    const failing = vi.fn(async (): Promise<string | undefined> => {
      throw new Error("walk exploded");
    });

    await expect(
      resolveWithCache(state, { key: "node", now: 0, resolve: failing }),
    ).rejects.toThrow("walk exploded");

    const recovered = vi.fn(async () => "/usr/bin/node");
    expect(
      await resolveWithCache(state, {
        key: "node",
        now: 0,
        resolve: recovered,
      }),
    ).toBe("/usr/bin/node");
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it("stamps the entry when the resolve finished, not when it started", async () => {
    // A cold getNodeExecutable spawns `which node`, walks every version-manager
    // directory and runs `node --version` on each candidate. Stamping with the
    // pre-resolve instant births the entry already aged by that much, so a slow
    // resolve shortens its own TTL — worst for the 30 s negative TTL, whose
    // resolve is by definition the slow one because a miss exhausts every
    // candidate.
    const state = createResolutionCacheState();
    const startedAt = 0;
    const finishedAt = RESOLUTION_NEGATIVE_TTL_MS - 1;
    const resolve = vi.fn(async () => undefined);

    await resolveWithCache(state, {
      key: "node",
      now: startedAt,
      clock: () => finishedAt,
      resolve,
    });

    // Live at finishedAt + (TTL - 1): only true if storedAt is finishedAt.
    const stillLive = await resolveWithCache(state, {
      key: "node",
      now: finishedAt + RESOLUTION_NEGATIVE_TTL_MS - 1,
      resolve,
    });
    expect(stillLive).toBeUndefined();
    expect(resolve).toHaveBeenCalledTimes(1);

    // And it does expire on the far side of the TTL measured from finishedAt.
    await resolveWithCache(state, {
      key: "node",
      now: finishedAt + RESOLUTION_NEGATIVE_TTL_MS + 1,
      resolve,
    });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("expires a positive entry and re-resolves once the clock passes the TTL", async () => {
    const state = createResolutionCacheState();
    const resolve = vi.fn(async () => "/usr/bin/node");

    await resolveWithCache(state, { key: "node", now: 0, resolve });
    const second = await resolveWithCache(state, {
      key: "node",
      now: RESOLUTION_POSITIVE_TTL_MS + 1,
      resolve,
    });

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(second).toBe("/usr/bin/node");
  });

  it("caches a negative result under the shorter negative TTL", async () => {
    const state = createResolutionCacheState();
    const resolve = vi.fn(async () => undefined);

    // 1. Inside the negative TTL the miss is served from cache. `undefined` is a
    //    RECORDED result here, not an absent entry — that distinction is the
    //    whole point of caching misses.
    const first = await resolveWithCache(state, {
      key: "gemini",
      now: 0,
      resolve,
    });
    const second = await resolveWithCache(state, {
      key: "gemini",
      now: RESOLUTION_NEGATIVE_TTL_MS - 1,
      resolve,
    });
    expect(first).toBeUndefined();
    expect(second).toBeUndefined();
    expect(resolve).toHaveBeenCalledTimes(1);

    // 2. Guard the premise before relying on it: the re-resolve point below sits
    //    well INSIDE the positive TTL, so an implementation with one TTL — or
    //    with the polarity check inverted — would still be serving the cached
    //    miss there. This is what distinguishes the two TTLs rather than
    //    assuming they differ.
    expect(RESOLUTION_NEGATIVE_TTL_MS + 1).toBeLessThan(
      RESOLUTION_POSITIVE_TTL_MS,
    );

    // 3. Past the negative TTL the resolver runs again, which bounds the "I just
    //    installed it and Drift still cannot see it" window to 30 seconds.
    const third = await resolveWithCache(state, {
      key: "gemini",
      now: RESOLUTION_NEGATIVE_TTL_MS + 1,
      resolve,
    });
    expect(third).toBeUndefined();
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("bypasses the cache when bypass is true and refreshes the stored entry", async () => {
    const state = createResolutionCacheState();
    const stale = vi.fn(async () => "/usr/local/bin/claude");
    const fresh = vi.fn(async () => "/opt/homebrew/bin/claude");

    await resolveWithCache(state, { key: "claude", now: 0, resolve: stale });
    expect(stale).toHaveBeenCalledTimes(1);

    // A live hit is present at now = 1000, and bypass runs the resolver anyway.
    const bypassed = await resolveWithCache(state, {
      key: "claude",
      now: 1000,
      bypass: true,
      resolve: fresh,
    });
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(bypassed).toBe("/opt/homebrew/bin/claude");

    // The bypass WROTE, it did not merely skip the read. Without this assertion
    // an implementation that only skipped the read would pass: the user who
    // pressed "Check" would see the fresh answer once and the stale one on the
    // very next turn.
    const afterwards = await resolveWithCache(state, {
      key: "claude",
      now: 2000,
      resolve: stale,
    });
    expect(afterwards).toBe("/opt/homebrew/bin/claude");
    expect(stale).toHaveBeenCalledTimes(1);
  });

  it("keys entries independently so node and a provider command do not collide", async () => {
    const state = createResolutionCacheState();
    const node = vi.fn(async () => "/usr/bin/node");
    const claude = vi.fn(async () => "/usr/local/bin/claude");

    expect(
      await resolveWithCache(state, { key: "node", now: 0, resolve: node }),
    ).toBe("/usr/bin/node");
    expect(
      await resolveWithCache(state, { key: "claude", now: 0, resolve: claude }),
    ).toBe("/usr/local/bin/claude");
    expect(state.entries.size).toBe(2);

    // Neither write clobbered the other, and neither read is served by the
    // other's entry.
    expect(
      await resolveWithCache(state, { key: "node", now: 1, resolve: node }),
    ).toBe("/usr/bin/node");
    expect(
      await resolveWithCache(state, { key: "claude", now: 1, resolve: claude }),
    ).toBe("/usr/local/bin/claude");
    expect(node).toHaveBeenCalledTimes(1);
    expect(claude).toHaveBeenCalledTimes(1);
  });
});

describe("resolution cache invalidation", () => {
  it("invalidates on command change when any provider command differs", async () => {
    const state = createResolutionCacheState();
    const resolve = vi.fn(async () => "/usr/local/bin/claude");

    syncResolutionCacheSignature(
      state,
      buildProviderCommandSignature({
        "claude-cli": { command: "claude" },
        "gemini-cli": { command: "gemini" },
      }),
    );
    await resolveWithCache(state, { key: "claude", now: 0, resolve });
    expect(state.entries.size).toBe(1);

    const changed = syncResolutionCacheSignature(
      state,
      buildProviderCommandSignature({
        "claude-cli": { command: "/opt/homebrew/bin/claude" },
        "gemini-cli": { command: "gemini" },
      }),
    );

    expect(changed).toBe(true);
    expect(state.entries.size).toBe(0);

    // The clear is what the user actually feels: the next resolution re-runs
    // rather than handing back a path resolved from the previous command.
    await resolveWithCache(state, { key: "claude", now: 1, resolve });
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("does not clear when the provider commands are unchanged", async () => {
    const state = createResolutionCacheState();
    const resolve = vi.fn(async () => "/usr/local/bin/claude");

    syncResolutionCacheSignature(
      state,
      buildProviderCommandSignature({
        "claude-cli": { command: "claude" },
        "gemini-cli": { command: "gemini" },
      }),
    );
    await resolveWithCache(state, { key: "claude", now: 0, resolve });

    const changed = syncResolutionCacheSignature(
      state,
      buildProviderCommandSignature({
        "claude-cli": { command: "claude" },
        "gemini-cli": { command: "gemini" },
      }),
    );

    expect(changed).toBe(false);
    expect(state.entries.size).toBe(1);
    // One clear only — the seed transition off "" on the first sync. A cache
    // that clears here is a cache that never serves anything.
    expect(state.clears).toBe(1);

    await resolveWithCache(state, { key: "claude", now: 1, resolve });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("produces a stable signature regardless of provider key order", () => {
    const inserted: Record<string, { command?: string }> = {};
    inserted["claude-cli"] = { command: "claude" };
    inserted["gemini-cli"] = { command: "gemini" };
    inserted["codex-cli"] = { command: "codex" };

    const reordered: Record<string, { command?: string }> = {};
    reordered["codex-cli"] = { command: "codex" };
    reordered["claude-cli"] = { command: "claude" };
    reordered["gemini-cli"] = { command: "gemini" };

    // The premise, asserted rather than assumed: the two objects really do
    // enumerate their keys in different orders.
    expect(Object.keys(inserted)).not.toEqual(Object.keys(reordered));
    expect(buildProviderCommandSignature(inserted)).toBe(
      buildProviderCommandSignature(reordered),
    );

    // And the consequence that matters: a settings save that only rebuilt the
    // object does not clear the cache. Without the sort this fires on every
    // save and PERF-03 becomes a pessimisation.
    const state = createResolutionCacheState();
    syncResolutionCacheSignature(
      state,
      buildProviderCommandSignature(inserted),
    );
    expect(
      syncResolutionCacheSignature(
        state,
        buildProviderCommandSignature(reordered),
      ),
    ).toBe(false);
  });

  it("changes the signature when a provider is added or removed", () => {
    const two = {
      "claude-cli": { command: "claude" },
      "gemini-cli": { command: "gemini" },
    };
    const three = { ...two, "codex-cli": { command: "codex" } };
    const one = { "claude-cli": { command: "claude" } };

    expect(buildProviderCommandSignature(three)).not.toBe(
      buildProviderCommandSignature(two),
    );
    expect(buildProviderCommandSignature(one)).not.toBe(
      buildProviderCommandSignature(two),
    );

    // A provider that is PRESENT with no command configured is not the same as
    // one that is absent — that is what the missing-command placeholder buys.
    expect(
      buildProviderCommandSignature({
        "claude-cli": { command: "claude" },
        "gemini-cli": {},
      }),
    ).not.toBe(buildProviderCommandSignature(one));
  });
});

describe("describeResolutionCache", () => {
  it("summarises entry count, ages and clears without leaking anything but resolved paths", () => {
    expect(describeResolutionCache(createResolutionCacheState(), 0)).toBe(
      "0 entries; 0 clears",
    );

    const state = createResolutionCacheState();
    clearResolutionCache(state);
    clearResolutionCache(state);
    writeResolutionCache(state, {
      key: "node",
      value: "/opt/homebrew/bin/node",
      now: 0,
    });
    writeResolutionCache(state, { key: "gemini", value: undefined, now: 4000 });

    const summary = describeResolutionCache(state, 12000);

    expect(summary).toContain("2 entries");
    expect(summary).toContain("node positive 12s");
    expect(summary).toContain("gemini negative 8s");
    expect(summary).toContain("2 clears");
    // One line, because getDiagnostics renders a flat Record<string, string>.
    expect(summary.split("\n")).toHaveLength(1);
    // Stricter than the T-04-04 ceiling on purpose: the threat register only
    // requires that nothing beyond an already-surfaced binary path escapes, and
    // this emits no cached VALUE at all. The key names carry everything a
    // support bundle needs.
    expect(summary).not.toContain("/opt/homebrew");
  });
});
