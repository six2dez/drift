// PERF-03's binary-resolution cache. Cache keying and every piece of TTL
// arithmetic here are pure, with `now` INJECTED as a parameter on every call —
// that is what makes expiry assertable without a fake timer or real elapsed
// time. index.ts keeps the actual spawn("which") + stat walk and hands it in as
// a `resolve` callback. The shape is createXState(): PlainObject + free
// functions, matching the backend's five existing pure modules
// (claude-print.ts:129-144, bounded-buffer.ts:47-58) rather than 04-RESEARCH's
// closure-factory sketch: the backend has no closure-factory precedent at all
// (those live only in the frontend's Pinia stores), and keeping the state a
// plain object makes cache contents directly inspectable in assertions and in
// getDiagnostics.

// 5 minutes. A resolved binary path is stable across a work session, and a
// stale hit costs at most one failed spawn because getNodeExecutable
// (index.ts:1545-1552) already re-walks its candidate list when the cached path
// fails to run.
export const RESOLUTION_POSITIVE_TTL_MS = 5 * 60 * 1000;

// 30 seconds, and the trade-off is the one 04-CONTEXT.md names explicitly.
// NOT caching misses repeats the expensive walk — readdir + stat per version
// directory per home directory — precisely in the slow case, because a miss is
// exactly the input that exhausts every candidate. Caching them means a freshly
// installed binary stays invisible for the TTL. 30 s bounds that window to
// something a user will not notice while still collapsing the repeated walk
// across a burst of turns, and the mandatory bypass on the user's manual
// "Check" button (resolveWithCache's `bypass`, wired at index.ts:1104-1109 by
// plan 04-10) is what makes any TTL choice safe rather than a gamble.
export const RESOLUTION_NEGATIVE_TTL_MS = 30 * 1000;

// `value: undefined` IS the negative cache — a recorded "this did not resolve",
// not an absent entry. Absence is the miss; readResolutionCache distinguishes
// the two by Map membership, never by the value.
export type ResolutionCacheEntry = {
  value: string | undefined;
  storedAt: number;
};

// `clears` is a monotonic counter for diagnostics only: it makes a cache that
// is being invalidated on every settings save (the failure mode a key-order-
// dependent signature would cause) visible in getDiagnostics instead of merely
// slow.
export type ResolutionCacheState = {
  entries: Map<string, ResolutionCacheEntry>;
  signature: string;
  positiveTtlMs: number;
  negativeTtlMs: number;
  clears: number;
};

export function createResolutionCacheState(options?: {
  positiveTtlMs?: number;
  negativeTtlMs?: number;
}): ResolutionCacheState {
  return {
    entries: new Map<string, ResolutionCacheEntry>(),
    signature: "",
    positiveTtlMs: options?.positiveTtlMs ?? RESOLUTION_POSITIVE_TTL_MS,
    negativeTtlMs: options?.negativeTtlMs ?? RESOLUTION_NEGATIVE_TTL_MS,
    clears: 0,
  };
}

// An entry is live while `now - storedAt` is strictly below the TTL that
// matches its polarity. The TTL is chosen per ENTRY, not per cache, which is
// the whole point of having two of them: a negative entry sitting well inside
// the 5 minute positive window is still expired.
//
// An expired entry is deleted on read rather than left to rot. Without that,
// the map would keep one dead entry per key that is never queried again, and
// describeResolutionCache would report a count that overstates what the cache
// can actually serve.
export function readResolutionCache(
  state: ResolutionCacheState,
  input: { key: string; now: number },
): { hit: boolean; value: string | undefined } {
  const entry = state.entries.get(input.key);
  if (entry === undefined) return { hit: false, value: undefined };

  const ttlMs =
    entry.value === undefined ? state.negativeTtlMs : state.positiveTtlMs;
  if (input.now - entry.storedAt < ttlMs) {
    return { hit: true, value: entry.value };
  }

  state.entries.delete(input.key);
  return { hit: false, value: undefined };
}

// Stores in place. Mutating the Map is consistent with the backend's
// module-level-singleton norm (index.ts holds every cache and process map as a
// module `let`/`const`) and keeps index.ts's call sites trivial — no reassigned
// state variable to forget.
export function writeResolutionCache(
  state: ResolutionCacheState,
  input: { key: string; value: string | undefined; now: number },
): void {
  state.entries.set(input.key, { value: input.value, storedAt: input.now });
}

// The single entry point index.ts uses, from BOTH resolveCommand
// (index.ts:848, which has no cache today) and the node-resolution path
// (index.ts:1558-1562, which has an infinite, never-invalidated one via
// lastNodeExecutable at index.ts:119). For node this is therefore a TIGHTENING
// — an unbounded cache replaced by a bounded one — and for providers it is
// genuinely new. Both must go through here or the phase ships two inconsistent
// behaviours.
//
// `bypass` always runs the resolver AND always refreshes the entry. Skipping
// only the read would leave the stale value in place for the next caller, so
// the user who pressed "Check" after installing a CLI would see the fresh
// answer once and the stale one immediately afterwards.
export async function resolveWithCache(
  state: ResolutionCacheState,
  input: {
    key: string;
    now: number;
    bypass?: boolean;
    resolve: () => Promise<string | undefined>;
  },
): Promise<string | undefined> {
  if (input.bypass !== true) {
    const cached = readResolutionCache(state, {
      key: input.key,
      now: input.now,
    });
    if (cached.hit) return cached.value;
  }

  // Writes `undefined` too — that IS the negative cache, not a skipped write.
  const resolved = await input.resolve();
  writeResolutionCache(state, {
    key: input.key,
    value: resolved,
    now: input.now,
  });
  return resolved;
}

export function clearResolutionCache(state: ResolutionCacheState): void {
  state.entries.clear();
  state.clears += 1;
}

// A NUL byte cannot appear in a path on any platform Drift supports, so a
// provider whose command is literally the placeholder text cannot forge a
// match against a provider that has no command configured at all.
const MISSING_COMMAND_PLACEHOLDER = "\u0000unset";

// Deterministic over the provider ids SORTED. The sort is the load-bearing
// part: Object.keys returns insertion order, so a settings object rebuilt with
// its keys in a different order would otherwise produce a different signature,
// clear the whole cache on every settings save, and turn PERF-03 into a
// pessimisation that still passes a naive "it invalidates" test.
//
// The `id=command` / newline framing is unambiguous here because the ids are
// Drift's own fixed set (claude-cli, gemini-cli, codex-cli, copilot-cli) and
// contain neither "=" nor a newline.
export function buildProviderCommandSignature(
  providers: Record<string, { command?: string } | undefined> | undefined,
): string {
  if (providers === undefined) return "";

  const lines: string[] = [];
  for (const id of Object.keys(providers).sort()) {
    const command = providers[id]?.command;
    const rendered =
      typeof command === "string" ? command : MISSING_COMMAND_PLACEHOLDER;
    lines.push(`${id}=${rendered}`);
  }
  return lines.join("\n");
}

// ROADMAP SC-6 requires invalidation whenever a provider command changes.
// Clearing the WHOLE cache is deliberate rather than lazy: per-key
// invalidation invites a missed key (the node entry is the obvious one to
// forget, and it is the entry whose staleness breaks MCP start), and the cache
// holds at most a handful of entries — node plus one per configured provider.
//
// The first call after startup moves the signature off its "" seed and reports
// true. That clears an empty cache, which is a no-op with an honest return
// value; the alternative — special-casing the seed — would hide a genuine
// first-turn change behind the same branch.
export function syncResolutionCacheSignature(
  state: ResolutionCacheState,
  signature: string,
): boolean {
  if (signature === state.signature) return false;
  state.signature = signature;
  clearResolutionCache(state);
  return true;
}

// One line for getDiagnostics. Key NAMES, ages in seconds, a positive/negative
// marker per entry, and the clear count — never the cached VALUES. A key is
// either "node" or a provider command the user typed, both of which
// getDiagnostics already surfaces (nodeExecutable at index.ts:2796); the
// resolved paths behind them add nothing a support bundle needs and are
// exactly the sort of thing a user pastes into a public issue (T-04-04).
export function describeResolutionCache(
  state: ResolutionCacheState,
  now: number,
): string {
  const parts: string[] = [];
  for (const [key, entry] of state.entries) {
    const ageSeconds = Math.max(0, Math.floor((now - entry.storedAt) / 1000));
    const polarity = entry.value === undefined ? "negative" : "positive";
    parts.push(`${key} ${polarity} ${ageSeconds}s`);
  }

  const detail = parts.length === 0 ? "" : `: ${parts.join(", ")}`;
  return `${state.entries.size} entries${detail}; ${state.clears} clears`;
}
