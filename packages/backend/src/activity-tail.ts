// PERF-02's incremental read of the MCP activity JSONL file. The two decisions —
// where to read from (planActivityRead) and how to split what came back
// (consumeActivityChunk) — are pure, separately exported, and tested with no disk.
// The per-tick open/read/close lives HERE rather than in index.ts so the
// truncation-reset and no-new-bytes behaviours are provable against a real file;
// index.ts keeps dedupe (seenActivityIds) and re-entrancy (readingActivities).
//
// What this replaces: index.ts:2158 does `readFile(activityFilePath, "utf-8")`
// and re-parses the ENTIRE growing file every 250 ms, on Caido's single-threaded
// event loop. This module replaces that loop's INPUT, not its semantics — the
// line handling below is parseRuntimeActivityEvents (index.ts:622-634) minus the
// JSON.parse, which stays in index.ts together with the RuntimeActivityEvent
// type and the tolerant `catch` that swallows a bad line.
//
// Both imports are already in index.ts (`:4` and `:2`), so this module introduces
// no new runtime surface into Caido's LLRT host. `createReadStream` is NOT
// available there — positional `read()` is the only offset mechanism.
import { Buffer } from "buffer";
import { open as openFile } from "fs/promises";

// Plain data with no methods, on purpose: index.ts holds the cursor in a closure
// local to `sendCliMessage`, which makes it per-session by construction and lets
// it die with the turn (a Map would need explicit cleanup and could leak on an
// unhandled path). Every function here returns a NEW cursor rather than mutating.
//
// `partial` is a Buffer and NOT a string. This is the one field of the named
// analog — claude-print.ts's `buffer: string` (`:90`) — that must not be copied.
// See consumeActivityChunk for why.
export type ActivityCursor = {
  offset: number;
  partial: Buffer;
  droppedBytes: number;
};

export function createActivityCursor(): ActivityCursor {
  return { offset: 0, partial: Buffer.alloc(0), droppedBytes: 0 };
}

// Bounds the per-tick allocation (T-04-09). 1 MiB is generous: the writer emits
// one `JSON.stringify(event)` line per tool call — a single `appendFileSync` at
// mcp-server.mjs:82 — so a tick that has to move a megabyte is already a
// pathological writer, not a busy one.
export const ACTIVITY_MAX_TICK_BYTES = 1024 * 1024;

// Bounds the CARRIED REMAINDER, which ACTIVITY_MAX_TICK_BYTES does not (T-04-14).
// The per-tick clamp caps one allocation; an unterminated line accumulates ACROSS
// ticks, so a single 100 MiB record would still reach 100 MiB in `cursor.partial`
// over 100 ticks of 1 MiB each. That content is derived from the target
// application's responses, so the ceiling has to be explicit.
//
// Same 4 MiB value and same drop-whole policy as CLAUDE_LINE_BUFFER_MAX_CHARS in
// plan 04-06, deliberately: this is the identical hazard shape (an unterminated
// line in a stream carrying target-application content), and shipping two
// different answers to one hazard inside one phase is how the next reader
// concludes that one of them was an oversight.
//
// The asymmetry that IS real and intended: 04-06's cap counts UTF-16 code units
// because its buffer is a string, whereas this one counts BYTES, because Pitfall
// 4 requires the remainder to stay a Buffer.
export const ACTIVITY_PARTIAL_MAX_BYTES = 4 * 1024 * 1024;

// Pure. Given the cursor and the file's current size, decide where to read from
// and how much — the whole offset half of PERF-02, with no I/O to mock.
//
// "idle" is the 250 ms COMMON CASE, not an edge case: nothing was written between
// two ticks far more often than something was, and answering it here is what
// keeps the steady state down to one open + one stat.
export function planActivityRead(input: {
  cursor: ActivityCursor;
  size: number;
  maxBytes?: number;
}): { action: "reset" | "idle" | "read"; position: number; length: number } {
  const maxBytes = input.maxBytes ?? ACTIVITY_MAX_TICK_BYTES;

  // The file shrank below what we already consumed: truncation or rotation.
  // Start over from byte 0 rather than reading from an offset that now points
  // into the middle of different content.
  if (input.size < input.cursor.offset) {
    return {
      action: "reset",
      position: 0,
      length: Math.min(input.size, maxBytes),
    };
  }

  if (input.size === input.cursor.offset) {
    return { action: "idle", position: input.cursor.offset, length: 0 };
  }

  return {
    action: "read",
    position: input.cursor.offset,
    length: Math.min(input.size - input.cursor.offset, maxBytes),
  };
}

// Applies the T-04-14 bound to the carried remainder ONLY — never to the merged
// buffer before the split. A merged buffer that contains newlines drains
// naturally, so the only unbounded case is a remainder with no terminator.
//
// The remainder is dropped WHOLE and the byte count recorded. It is deliberately
// not truncated-and-parsed: a truncated JSON line is unparseable, and index.ts's
// existing tolerant `catch` would swallow it — converting a visible, counted drop
// into a silent hole in the activity feed.
function boundPartial(
  cursor: ActivityCursor,
  partial: Buffer,
  maxPartialBytes: number,
): ActivityCursor {
  if (partial.byteLength > maxPartialBytes) {
    return {
      offset: cursor.offset,
      partial: Buffer.alloc(0),
      droppedBytes: cursor.droppedBytes + partial.byteLength,
    };
  }
  return { offset: cursor.offset, partial, droppedBytes: cursor.droppedBytes };
}

// Pure, and the byte-safety core (Pitfall 4).
//
// Only the COMPLETE-line prefix is decoded; the remainder is carried forward as a
// Buffer. Carrying it as a string instead would decode a half-finished UTF-8
// sequence at the chunk boundary and bake a permanent U+FFFD into the record —
// `JSON.stringify` does not escape non-ASCII, so any tool result containing an
// em-dash, an IDN hostname, or a non-ASCII response snippet emits raw UTF-8 bytes
// that a read boundary can land inside. Once decoded, the damage is unrecoverable.
//
// `offset` is passed through unchanged: the caller advances it by `bytesRead`,
// because only the caller knows how many bytes the read actually returned.
//
// Line semantics are parseRuntimeActivityEvents's (index.ts:622-634) exactly:
// split on "\n", trim, drop empty. The JSON.parse stays in index.ts.
export function consumeActivityChunk(
  cursor: ActivityCursor,
  bytes: Buffer,
  options?: { maxPartialBytes?: number },
): { cursor: ActivityCursor; lines: string[] } {
  // The override exists so a unit test can prove the drop at a legible size
  // instead of allocating 4 MiB.
  const maxPartialBytes =
    options?.maxPartialBytes ?? ACTIVITY_PARTIAL_MAX_BYTES;
  const merged = Buffer.concat([cursor.partial, bytes]);
  const lastNewline = merged.lastIndexOf(0x0a);

  if (lastNewline === -1) {
    return { cursor: boundPartial(cursor, merged, maxPartialBytes), lines: [] };
  }

  const complete = merged.subarray(0, lastNewline).toString("utf-8");
  const lines = complete
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  return {
    cursor: boundPartial(
      cursor,
      merged.subarray(lastNewline + 1),
      maxPartialBytes,
    ),
    lines,
  };
}

// The structural minimum of fs/promises' FileHandle that this module uses. Having
// it as a named type is what makes `open` injectable, and injectable `open` is
// what lets a test drive the never-throw contract without a real failure.
export type ActivityFileHandle = {
  stat(): Promise<{ size: number }>;
  read(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number }>;
  close(): Promise<void>;
};

// One tick of the tail: open, stat, plan, read, split, close.
//
// NEVER THROWS. On any error it returns the INCOMING cursor and no lines,
// preserving the best-effort contract of the `catch {}` at index.ts:2180 — a
// transient read failure must cost at most one tick of activity, never the turn.
export async function readActivityTick(input: {
  filePath: string;
  cursor: ActivityCursor;
  maxBytes?: number;
  open?: (filePath: string, flags: string) => Promise<ActivityFileHandle>;
}): Promise<{ cursor: ActivityCursor; lines: string[] }> {
  const open = input.open ?? openFile;
  try {
    const handle = await open(input.filePath, "r");
    try {
      const { size } = await handle.stat();
      const plan = planActivityRead({
        cursor: input.cursor,
        size,
        maxBytes: input.maxBytes,
      });

      if (plan.action === "idle") {
        return { cursor: input.cursor, lines: [] };
      }

      // On "reset" the file was truncated or rotated under us, so everything the
      // old cursor knew — offset AND any half-line it was carrying — describes
      // content that no longer exists. plan.position is already 0.
      //
      // `droppedBytes` is the ONE field that must SURVIVE the reset, because it
      // is documented as CUMULATIVE and index.ts depends on that monotonicity:
      // it reports a drop only when the value read back exceeds the value it
      // captured before the tick (index.ts:2876/2888). Zeroing it here means a
      // cursor that had dropped 6 MiB, then truncates, then drops a fresh 5 MiB
      // inside this same tick, compares as `5 MiB > 6 MiB` → false and the
      // second drop is never reported at all. "A drop nobody can see is a
      // repudiation gap" is this phase's own rule.
      //
      // The discarded remainder is ADDED to the tally rather than merely
      // preserved: those bytes were read out of the file and can now never be
      // emitted as a line, which is exactly what droppedBytes counts. Silently
      // discarding them understated the loss.
      const cursor =
        plan.action === "reset"
          ? {
              ...createActivityCursor(),
              droppedBytes:
                input.cursor.droppedBytes + input.cursor.partial.length,
            }
          : input.cursor;

      // Sized EXACTLY to the read length, with offset 0. LLRT's FileHandle.read
      // ends in `dst_buf[offset..].copy_from_slice(&buf)`, and Rust's
      // copy_from_slice PANICS unless the source and destination slice lengths
      // match exactly. Its validate_length_offset only checks
      // `length <= buffer_length - offset`, so a SMALLER explicit length passes
      // validation and then panics inside the host. Never reuse one large buffer
      // with a smaller per-read length. The same source also carries
      // `position: Opt<Option<u64>>, // -1 is not supported`, so the position
      // passed below is always non-negative.
      //
      // None of this is observable on Node, which has no such constraint — no
      // local or CI test can catch a violation, so 04-VALIDATION.md grades this
      // as a static/code-review row and THIS COMMENT IS THE ARTIFACT. Do not
      // hoist the allocation, resize it, or share it between ticks.
      const buffer = Buffer.alloc(plan.length);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        plan.length,
        plan.position,
      );

      const advanced: ActivityCursor = {
        offset: cursor.offset + bytesRead,
        partial: cursor.partial,
        droppedBytes: cursor.droppedBytes,
      };
      return consumeActivityChunk(advanced, buffer.subarray(0, bytesRead));
    } finally {
      // Close every tick; never hold the handle across ticks. A held handle
      // blocks `rm(activityFilePath)` at finalize() on Windows with EBUSY,
      // leaving a token-adjacent runtime file on disk. Four opens per second is
      // negligible next to that.
      //
      // Its own catch: a close failure must not mask a read that already
      // succeeded, and must not turn this function into one that throws.
      try {
        await handle.close();
      } catch {
        // Best-effort only.
      }
    }
  } catch {
    // Best-effort only — same contract as index.ts:2180. The file is pre-created
    // at index.ts:615, so ENOENT is not the normal path, but the turn must
    // survive it either way.
    return { cursor: input.cursor, lines: [] };
  }
}
